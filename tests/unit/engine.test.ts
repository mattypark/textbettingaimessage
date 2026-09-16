import { describe, expect, it } from "vitest";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { escrowAccount } from "@/src/ledger/types";

const T0 = new Date("2026-09-16T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

function makeBet(patch: Partial<Bet> = {}): Bet {
  return {
    id: "bet-abc123",
    chatId: "chat1",
    creatorId: "matt",
    status: "proposed",
    claim: "I make a half-court shot by Friday",
    stake: { kind: "points", amount: 20n, currency: "PTS" },
    participants: [
      { userId: "matt", side: "for", required: true, acceptedAt: T0.toISOString() },
      { userId: "jake", side: "against", required: true },
      { userId: "sam", side: "against", required: true },
    ],
    proofCriteria: { summary: "video of the shot", required: ["ball goes in"], optional: [], challengeTokenRequired: true, mediaKinds: ["video"] },
    judgeKind: "bot",
    createdAt: T0.toISOString(),
    acceptByAt: at(24).toISOString(),
    deadlineAt: at(72).toISOString(),
    proofGraceHours: 12,
    noProofRule: "auto_loss",
    version: 0,
    ...patch,
  };
}

async function harness(now = { value: at(1) }) {
  const store = new MemoryBetStore();
  const ledger = new MemoryLedger();
  for (const u of ["matt", "jake", "sam"]) await ledger.grant({ userId: u, amount: 100n, idem: `g:${u}` });
  const posts: Array<{ chatId: string; text: string; key: string }> = [];
  const engine = new BetEngine({
    store,
    ledger,
    post: async (chatId, message, key) => {
      posts.push({ chatId, text: message.text, key });
    },
    names: (id) => id,
    clock: () => now.value,
  });
  await store.create(makeBet());
  return { store, ledger, engine, posts, now };
}

describe("BetEngine", () => {
  it("locks exactly once under 10 concurrent accepts and holds every stake", async () => {
    const { engine, ledger, posts, store } = await harness();
    // Serialize the winner of the race by racing the same two accepts many times.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => engine.apply("bet-abc123", { type: "ACCEPT", userId: i % 2 ? "jake" : "sam" }))
    );
    const bet = await store.get("bet-abc123");
    expect(bet?.status).toBe("locked");
    expect(bet?.challengeToken).toMatch(/^[a-z]+-\d{2}$/);
    expect(posts.filter((p) => p.text.startsWith("🔒 LOCKED"))).toHaveLength(1);
    expect(ledger.balance(escrowAccount("bet-abc123"))).toBe(60n);
    for (const u of ["matt", "jake", "sam"]) expect((await ledger.wallet(u)).available).toBe(80n);
    expect(store.records.every((r) => r.effectsCompletedAt)).toBe(true);
  });

  it("runs the full lifecycle: lock → proof → verdict → settle, wallets reconcile", async () => {
    const { engine, ledger, posts, now } = await harness();
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "jake" });
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "sam" });
    now.value = at(50);
    await engine.apply("bet-abc123", { type: "PROOF", userId: "matt", proofId: "proof1" });
    await engine.apply("bet-abc123", { type: "JUDGE_START" });
    await engine.apply("bet-abc123", { type: "VERDICT", outcome: "for", confidence: 0.95, proofId: "proof1" });
    now.value = at(75);
    const settled = await engine.apply("bet-abc123", { type: "TIMEOUT_DISPUTE" });
    expect(settled.status).toBe("settled");
    expect((await ledger.wallet("matt")).available).toBe(140n);
    expect((await ledger.wallet("jake")).available).toBe(80n);
    expect((await ledger.wallet("sam")).available).toBe(80n);
    expect(ledger.balance(escrowAccount("bet-abc123"))).toBe(0n);
    expect(posts.at(-1)?.text).toMatch(/SETTLED/);
    expect(posts.find((p) => p.text.includes("Show the word"))).toBeTruthy();
  });

  it("dispute: loser bonds, upheld → bond to winner, honor recorded", async () => {
    const { engine, ledger, store, now } = await harness();
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "jake" });
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "sam" });
    now.value = at(50);
    await engine.apply("bet-abc123", { type: "PROOF", userId: "matt", proofId: "proof1" });
    await engine.apply("bet-abc123", { type: "JUDGE_START" });
    await engine.apply("bet-abc123", { type: "VERDICT", outcome: "for", confidence: 0.9, proofId: "proof1" });
    await engine.apply("bet-abc123", { type: "DISPUTE", userId: "jake", disputeId: "d1" });
    expect((await ledger.wallet("jake")).held).toBe(30n); // 20 stake + 10 bond
    expect(store.judgeQueue.at(-1)).toEqual({ betId: "bet-abc123", proofId: "proof1", pass: 2 });
    await engine.apply("bet-abc123", { type: "DISPUTE_DECISION", result: "upheld", decidedBy: "ai" });
    expect((await ledger.wallet("matt")).available).toBe(150n); // 100 - 20 + 60 pot + 10 bond
    expect((await ledger.wallet("jake")).available).toBe(70n);
    expect(store.honor).toContainEqual({ userId: "jake", betId: "bet-abc123", delta: -3, reason: "dispute lost" });
  });

  it("replays incomplete effects idempotently after a simulated crash", async () => {
    const { engine, ledger, store, posts } = await harness();
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "jake" });
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "sam" });
    // Pretend the process died before markEffectsDone on the lock transition.
    const lock = store.records.find((r) => r.toStatus === "locked")!;
    lock.effectsCompletedAt = undefined;
    const postsBefore = posts.length;
    await engine.replayIncomplete();
    expect(ledger.balance(escrowAccount("bet-abc123"))).toBe(60n); // not doubled
    expect(posts.length).toBe(postsBefore + 1); // poster is called again; the outbox key dedupes downstream
    expect(posts.at(-1)?.key).toBe(posts[postsBefore - 1].key);
    expect(lock.effectsCompletedAt).toBeTruthy();
  });

  it("void after lock refunds everyone", async () => {
    const { engine, ledger } = await harness();
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "jake" });
    await engine.apply("bet-abc123", { type: "ACCEPT", userId: "sam" });
    await engine.apply("bet-abc123", { type: "CANCEL_MUTUAL" });
    for (const u of ["matt", "jake", "sam"]) expect(await ledger.wallet(u)).toEqual({ available: 100n, held: 0n, currency: "PTS" });
  });
});
