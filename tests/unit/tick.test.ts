import { describe, expect, it } from "vitest";
import { commandHandler } from "@/src/bets/commands";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { tick } from "@/src/jobs/tick";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { escrowAccount } from "@/src/ledger/types";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

const T0 = new Date("2026-09-16T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

async function world() {
  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const now = { value: T0 };
  for (const u of ["+1matt", "+1jake"]) {
    const user = await store.upsertUser(u);
    await ledger.grant({ userId: user.id, amount: 100n, idem: `g:${u}` });
  }
  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => id, clock: () => now.value });
  const pipeline = new InboundPipeline({
    store,
    transport,
    handler: commandHandler({ store: betStore, engine, names: (id) => id, clock: () => now.value }),
    botNames: ["mushy"],
    onCardPosted: (betId, id) => betStore.setCardMessageId(betId, id),
  });
  const msg = (id: string, from: string, text: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: from, text, isGroup: true, ...extra });
  const deps = { store, betStore, engine, outbox, pipeline, clock: () => now.value };
  return { store, betStore, ledger, transport, outbox, engine, pipeline, msg, now, deps };
}

describe("tick", () => {
  it("expires an unaccepted bet after the accept window and tells the chat", async () => {
    const w = await world();
    await w.pipeline.handle(w.msg("m1", "+1matt", "!bet thing ; 5 ; friday"), {});
    w.now.value = at(23);
    expect((await tick(w.deps)).timeouts.advanced).toEqual([]);
    w.now.value = at(25);
    const report = await tick(w.deps);
    expect(report.timeouts.advanced[0]).toMatch(/TIMEOUT_ACCEPT$/);
    expect([...w.betStore.bets.values()][0].status).toBe("expired");
    expect(w.transport.transcript("g1").at(-1)).toMatch(/expired/);
  });

  it("auto-loses a locked bet with no proof, then settles after the dispute window", async () => {
    const w = await world();
    await w.pipeline.handle(w.msg("m1", "+1matt", "!bet thing ; 20 ; tomorrow"), {});
    const card = w.transport.sends[0];
    await w.pipeline.handle(w.msg("r1", "+1jake", "", { reaction: { targetProviderMessageId: card.providerMessageId, kind: "affirm", removed: false } }), {});
    const bet = [...w.betStore.bets.values()][0];
    expect(bet.status).toBe("locked");
    expect(w.ledger.balance(escrowAccount(bet.id))).toBe(40n);

    w.now.value = new Date(Date.parse(bet.deadlineAt) + 13 * 3600_000);
    expect((await tick(w.deps)).timeouts.advanced[0]).toMatch(/TIMEOUT_DEADLINE$/);
    expect((await w.betStore.get(bet.id))?.status).toBe("verdict_posted");

    w.now.value = new Date(w.now.value.getTime() + 25 * 3600_000);
    expect((await tick(w.deps)).timeouts.advanced[0]).toMatch(/TIMEOUT_DISPUTE$/);
    expect((await w.betStore.get(bet.id))?.status).toBe("settled");
    const jake = await w.store.upsertUser("+1jake");
    expect((await w.ledger.wallet(jake.id)).available).toBe(120n);
    expect(w.transport.transcript("g1").at(-1)).toMatch(/SETTLED/);
  });

  it("drains a failed outbox row on the next tick and gives up after the retry cap", async () => {
    const w = await world();
    const chat = await w.store.upsertChat({ provider: "fake", providerEventId: "s", providerMessageId: "s", providerChatId: "g1", isGroup: true, senderHandle: "+1matt", text: "", attachments: [], receivedAt: T0.toISOString(), raw: {} });
    let failures = 1;
    const realSend = w.transport.send.bind(w.transport);
    w.transport.send = async (chatId, message) => {
      if (failures-- > 0) throw new Error("provider 500");
      return realSend(chatId, message);
    };
    await expect(w.outbox.send(chat.id, { text: "hello" }, "k1")).rejects.toThrow(/500/);
    expect(w.store.outbox[0].status).toBe("failed");
    const report = await tick(w.deps);
    expect(report.outboxSent).toBe(1);
    expect(w.store.outbox[0].status).toBe("sent");
    expect(w.transport.transcript("g1")).toEqual(["hello"]);

    failures = 99;
    await expect(w.outbox.send(chat.id, { text: "doomed" }, "k2")).rejects.toThrow();
    await tick(w.deps);
    await tick(w.deps);
    const third = await tick(w.deps);
    expect(third.outboxFailed).toBe(0); // attempts hit the cap of 3 → no longer retried
    expect(w.store.outbox[1].attempts).toBe(3);
  });

  it("reprocesses an inbox row that was claimed but never finished", async () => {
    const w = await world();
    const res = await w.pipeline.handle(w.msg("m1", "+1matt", "mushy hi"), {});
    expect(res.outcome).toBe("processed");
    const row = [...w.store.inbox.values()][0];
    row.status = "processing";
    row.at = Date.now() - 120_000;
    const before = w.transport.sends.length;
    const report = await tick(w.deps);
    expect(report.inboxReprocessed).toBe(1);
    expect(row.status).toBe("processed");
    expect(w.transport.sends.length).toBe(before); // outbox keys dedupe the reply
  });
});
