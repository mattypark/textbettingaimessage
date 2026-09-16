import { describe, expect, it } from "vitest";
import { agentHandler } from "@/src/agent/handler";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { tick } from "@/src/jobs/tick";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import type { Judge } from "@/src/proof/judge";
import { MemoryMediaStore } from "@/src/proof/media-store";
import { runJudgeJob } from "@/src/proof/run-judge";
import { MemoryProofStore } from "@/src/proof/store";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

const T0 = new Date("2026-09-16T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

async function world(judge: Judge) {
  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const proofStore = new MemoryProofStore();
  betStore.jobSink = (kind, payload) => proofStore.enqueue(kind, payload);
  const media = new MemoryMediaStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const now = { value: T0 };
  const users: Record<string, string> = {};
  for (const h of ["+1matt", "+1jake", "+1ref"]) {
    const u = await store.upsertUser(h);
    users[h] = u.id;
    await store.recordTermsAcceptance(u.id, 1, "imessage");
    await ledger.grant({ userId: u.id, amount: 100n, idem: `g:${h}` });
  }
  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => id, clock: () => now.value });
  const pipeline = new InboundPipeline({
    store,
    transport,
    handler: agentHandler({ store, betStore, engine, ledger, siteUrl: "https://x.test", botName: "bookie", clock: () => now.value, runTurn: async () => [] }),
    botNames: ["bookie"],
    onCardPosted: (betId, id) => betStore.setCardMessageId(betId, id),
  });
  const msg = (id: string, from: string, text: string) => JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: from, text, isGroup: true });
  const deps = { store, betStore, engine, outbox, pipeline, proofStore, clock: () => now.value, jobRunners: { judge: (payload: Record<string, unknown>) => runJudgeJob({ betStore, proofStore, media, engine, judge }, payload as { betId: string; proofId: string; pass: 1 | 2; disputeReason?: string }) } };
  return { store, betStore, proofStore, media, ledger, transport, pipeline, msg, now, deps, users, engine };
}

async function postedVerdict(w: Awaited<ReturnType<typeof world>>, patch: Partial<Bet> = {}): Promise<Bet> {
  const bet: Bet = {
    id: "aaaaaa11-0000-4000-8000-000000000001",
    chatId: [...w.store.chats.values()][0]?.id ?? (await w.store.upsertChat({ provider: "fake", providerEventId: "s", providerMessageId: "s", providerChatId: "g1", isGroup: true, senderHandle: "+1matt", text: "", attachments: [], receivedAt: T0.toISOString(), raw: {} })).id,
    creatorId: w.users["+1matt"],
    status: "proposed",
    claim: "I make the shot",
    stake: { kind: "points", amount: 20n, currency: "PTS" },
    participants: [
      { userId: w.users["+1matt"], side: "for", required: true, acceptedAt: T0.toISOString() },
      { userId: w.users["+1jake"], side: "against", required: true },
    ],
    proofCriteria: { summary: "ball in", required: ["ball in"], optional: [], challengeTokenRequired: false, mediaKinds: ["photo"] },
    judgeKind: "bot",
    createdAt: T0.toISOString(),
    acceptByAt: at(24).toISOString(),
    deadlineAt: at(72).toISOString(),
    proofGraceHours: 12,
    noProofRule: "auto_loss",
    version: 0,
    ...patch,
  };
  await w.betStore.create(bet);
  await w.engine.apply(bet.id, { type: "ACCEPT", userId: w.users["+1jake"] });
  const proof = await w.proofStore.createProof({ betId: bet.id, submitterId: bet.creatorId, providerMessageId: "p", storagePath: "x", mime: "image/png", bytes: 1, sha256: "s", phash: null, exif: {}, capturedAt: null });
  await w.media.put("x", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png");
  await w.engine.apply(bet.id, { type: "PROOF", userId: bet.creatorId, proofId: proof.id });
  if (bet.judgeKind === "bot") {
    await w.engine.apply(bet.id, { type: "JUDGE_START" });
    await w.engine.apply(bet.id, { type: "VERDICT", outcome: "for", confidence: 0.9, proofId: proof.id });
  }
  return (await w.betStore.get(bet.id))!;
}

describe("disputes", () => {
  it("!dispute by the loser posts a bond and the AI second pass upholds → bond forfeited to the winner", async () => {
    const upheld: Judge = async () => ({ model: "fake", verdict: { outcome: "for", confidence: 0.9, criteria_checks: [], challenge_token_visible: true, tamper_flags: [], reasoning: "still in" } });
    const w = await world(upheld);
    const bet = await postedVerdict(w);
    await w.pipeline.handle(w.msg("d1", "+1jake", `!dispute #${bet.id.slice(0, 6)} the ball rimmed out`), {});
    const disputed = await w.betStore.get(bet.id);
    expect(disputed?.status).toBe("disputed");
    expect(disputed?.dispute?.reason).toBe("the ball rimmed out");
    expect((await w.ledger.wallet(w.users["+1jake"])).held).toBe(30n);
    expect(w.transport.transcript("g1").at(-1)).toMatch(/disputed by .*rimmed out/);
    expect(w.proofStore.jobs.at(-1)?.payload).toMatchObject({ pass: 2, disputeReason: "the ball rimmed out" });

    await tick(w.deps);
    const settled = await w.betStore.get(bet.id);
    expect(settled?.status).toBe("settled");
    expect((await w.ledger.wallet(w.users["+1matt"])).available).toBe(130n); // 100 - 20 stake + 40 pot + 10 bond
    expect((await w.ledger.wallet(w.users["+1jake"])).available).toBe(70n);
    expect(w.betStore.honor).toContainEqual(expect.objectContaining({ userId: w.users["+1jake"], delta: -3 }));
  });

  it("second pass overturns → bond back, payout flips", async () => {
    const overturn: Judge = async () => ({ model: "fake", verdict: { outcome: "against", confidence: 0.85, criteria_checks: [], challenge_token_visible: true, tamper_flags: ["rimmed out on replay"], reasoning: "missed" } });
    const w = await world(overturn);
    const bet = await postedVerdict(w);
    await w.pipeline.handle(w.msg("d1", "+1jake", `!dispute ${bet.id.slice(0, 6)}`), {});
    await tick(w.deps);
    const settled = await w.betStore.get(bet.id);
    expect(settled?.status).toBe("settled");
    expect(settled?.verdict?.outcome).toBe("against");
    expect((await w.ledger.wallet(w.users["+1jake"])).available).toBe(120n);
    expect((await w.ledger.wallet(w.users["+1matt"])).available).toBe(80n);
  });

  it("winner cannot dispute; nobody can after the window", async () => {
    const w = await world(async () => { throw new Error("unused"); });
    const bet = await postedVerdict(w);
    await w.pipeline.handle(w.msg("d1", "+1matt", `!dispute ${bet.id.slice(0, 6)}`), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/winners cannot dispute/);
    w.now.value = at(200);
    await w.pipeline.handle(w.msg("d2", "+1jake", `!dispute ${bet.id.slice(0, 6)}`), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/window closed/);
  });

  it("referee bets: proof prompts the ref, 'call #id yes' posts the verdict, a later dispute goes back to the ref, silence voids", async () => {
    const w = await world(async () => { throw new Error("AI must not judge referee bets"); });
    const bet = await postedVerdict(w, { judgeKind: "referee", refereeUserId: w.users["+1ref"] });
    expect(w.transport.transcript("g1").at(-1)).toMatch(/you're the ref/);
    await tick(w.deps); // judge job → JUDGE_START only
    expect((await w.betStore.get(bet.id))?.status).toBe("judging");

    await w.pipeline.handle(w.msg("c0", "+1jake", `call ${bet.id.slice(0, 6)} no`), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/only the named referee/);
    await w.pipeline.handle(w.msg("c1", "+1ref", `call ${bet.id.slice(0, 6)} yes`), {});
    expect((await w.betStore.get(bet.id))?.verdict?.outcome).toBe("for");
    expect(w.transport.transcript("g1").at(-1)).toMatch(/VERDICT/);

    await w.pipeline.handle(w.msg("d1", "+1jake", `!dispute ${bet.id.slice(0, 6)} no way`), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/final call/);
    await tick(w.deps); // AI pass-2 job is a no-op for referee bets
    expect((await w.betStore.get(bet.id))?.status).toBe("disputed");

    w.now.value = at(72);
    await tick(w.deps);
    expect((await w.betStore.get(bet.id))?.status).toBe("voided");
    for (const h of ["+1matt", "+1jake"]) expect((await w.ledger.wallet(w.users[h])).available).toBe(100n);
  });

  it("referee overturns on dispute", async () => {
    const w = await world(async () => { throw new Error("unused"); });
    const bet = await postedVerdict(w, { judgeKind: "referee", refereeUserId: w.users["+1ref"] });
    await w.pipeline.handle(w.msg("c1", "+1ref", `call ${bet.id.slice(0, 6)} yes`), {});
    await w.pipeline.handle(w.msg("d1", "+1jake", `!dispute ${bet.id.slice(0, 6)}`), {});
    await w.pipeline.handle(w.msg("c2", "+1ref", `call ${bet.id.slice(0, 6)} no`), {});
    const settled = await w.betStore.get(bet.id);
    expect(settled?.status).toBe("settled");
    expect(settled?.verdict?.outcome).toBe("against");
    expect((await w.ledger.wallet(w.users["+1jake"])).available).toBe(120n);
  });
});
