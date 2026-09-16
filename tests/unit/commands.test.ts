import { describe, expect, it } from "vitest";
import { BetEngine } from "@/src/bets/engine";
import { commandHandler, parseBetCommand, parseDeadline, parseStake } from "@/src/bets/commands";
import { MemoryBetStore } from "@/src/bets/store";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { escrowAccount } from "@/src/ledger/types";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

const NOW = new Date("2026-09-16T12:00:00Z"); // a Wednesday

describe("parseDeadline", () => {
  const chicagoDay = (d: Date | null) => d?.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  it.each([
    ["friday", "2026-09-18"],
    ["wed", "2026-09-23"], // same weekday → next week
    ["tomorrow", "2026-09-17"],
    ["in 2 days", "2026-09-18"],
    ["2026-10-01", "2026-10-01"],
  ])("%s → %s (America/Chicago)", (input, day) => {
    expect(chicagoDay(parseDeadline(input, NOW, "America/Chicago"))).toBe(day);
  });
  it("end of day is 23:59 in the group's zone, whatever the server zone", () => {
    const d = parseDeadline("friday", NOW, "America/Chicago")!;
    expect(d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: false })).toBe("23:59:00");
    expect(d.toISOString()).toBe("2026-09-19T04:59:00.000Z");
  });
  it("rejects nonsense", () => {
    expect(parseDeadline("whenever", NOW)).toBeNull();
  });
});

describe("parseStake / parseBetCommand", () => {
  it("reads points and social stakes", () => {
    expect(parseStake("20")).toEqual({ kind: "points", amount: 20n, currency: "PTS" });
    expect(parseStake("50 pts")?.amount).toBe(50n);
    expect(parseStake("loser buys dinner")).toMatchObject({ kind: "social", amount: 0n, description: "loser buys dinner" });
  });
  it("parses the three-part command and explains failures", () => {
    const ok = parseBetCommand("!bet I make a half court shot ; 20 ; friday", NOW);
    expect(ok).toMatchObject({ claim: "I make a half court shot", stake: { amount: 20n } });
    expect(parseBetCommand("!bet just vibes", NOW)).toMatchObject({ error: expect.stringContaining("format") });
    expect(parseBetCommand("!bet x ; 20 ; whenever", NOW)).toMatchObject({ error: expect.stringContaining("deadline") });
  });
});

describe("!bet through the pipeline", () => {
  async function harness() {
    const store = new MemoryStore();
    const betStore = new MemoryBetStore();
    const ledger = new MemoryLedger();
    const transport = new FakeTransport();
    const outbox = new Outbox(store, transport);
    for (const u of ["+1matt", "+1jake"]) {
      const user = await store.upsertUser(u);
      await ledger.grant({ userId: user.id, amount: 100n, idem: `g:${u}` });
    }
    const names = (id: string) => id;
    const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names, clock: () => NOW });
    const pipeline = new InboundPipeline({
      store,
      transport,
      handler: commandHandler({ store: betStore, engine, names, clock: () => NOW }),
      botNames: ["bookie"],
      onCardPosted: (betId, id) => betStore.setCardMessageId(betId, id),
    });
    return { store, betStore, ledger, transport, pipeline };
  }
  const msg = (id: string, from: string, text: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: from, text, isGroup: true, ...extra });

  it("creates a card, a stranger's 👍 takes the other side and locks with holds", async () => {
    const { pipeline, transport, betStore, ledger, store } = await harness();
    const created = await pipeline.handle(msg("m1", "+1matt", "!bet I make a half court shot ; 20 ; friday"), {});
    expect(created).toMatchObject({ outcome: "processed", replies: 1 });
    const card = transport.sends[0];
    expect(card.message.text).toMatch(/🎯 BET #/);
    const bet = [...betStore.bets.values()][0];
    expect(bet.cardProviderMessageId).toBe(card.providerMessageId);

    const reacted = await pipeline.handle(msg("r1", "+1jake", "", { reaction: { targetProviderMessageId: card.providerMessageId, kind: "affirm", removed: false } }), {});
    expect(reacted).toMatchObject({ outcome: "processed" });
    const locked = await betStore.get(bet.id);
    expect(locked?.status).toBe("locked");
    expect(locked?.participants.map((p) => [p.side, Boolean(p.acceptedAt)])).toEqual([["for", true], ["against", true]]);
    expect(ledger.balance(escrowAccount(bet.id))).toBe(40n);
    expect(transport.transcript("g1").at(-1)).toMatch(/🔒 LOCKED/);
    const jake = await store.upsertUser("+1jake");
    expect((await ledger.wallet(jake.id)).available).toBe(80n);
  });

  it("creator's own 👍 and a 😂 do nothing; a text-form Liked with no target resolves to the newest card", async () => {
    const { pipeline, transport, betStore } = await harness();
    await pipeline.handle(msg("m1", "+1matt", "!bet I run a 5k ; loser buys dinner ; tomorrow"), {});
    const card = transport.sends[0];
    await pipeline.handle(msg("r0", "+1matt", "", { reaction: { targetProviderMessageId: card.providerMessageId, kind: "affirm", removed: false } }), {});
    await pipeline.handle(msg("r1", "+1jake", "", { reaction: { targetProviderMessageId: card.providerMessageId, kind: "other", emoji: "😂", removed: false } }), {});
    expect([...betStore.bets.values()][0].status).toBe("proposed");
    await pipeline.handle(msg("r2", "+1jake", "", { reaction: { targetProviderMessageId: "", kind: "affirm", removed: false } }), {});
    expect([...betStore.bets.values()][0].status).toBe("locked");
  });

  it("!cancel voids the creator's open bets and !balance reads the wallet", async () => {
    const { pipeline, transport, betStore } = await harness();
    await pipeline.handle(msg("m1", "+1matt", "!bet thing ; 5 ; friday"), {});
    await pipeline.handle(msg("m2", "+1matt", "!cancel"), {});
    expect([...betStore.bets.values()][0].status).toBe("cancelled");
    await pipeline.handle(msg("m3", "+1matt", "!balance"), {});
    expect(transport.transcript("g1").at(-1)).toMatch(/100 pts available, 0 held/);
  });

  it("bad command explains the format", async () => {
    const { pipeline, transport } = await harness();
    await pipeline.handle(msg("m1", "+1matt", "!bet nope"), {});
    expect(transport.transcript("g1")[0]).toMatch(/format:/);
  });
});
