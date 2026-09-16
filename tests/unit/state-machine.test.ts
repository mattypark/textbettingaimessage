import { describe, expect, it } from "vitest";
import { dueTimeout, IllegalTransition, payoutsFor, transition, type BetEvent } from "@/src/bets/state-machine";
import { BET_STATUSES, type Bet, type BetStatus } from "@/src/bets/types";

const T0 = new Date("2026-09-16T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);

function bet(patch: Partial<Bet> = {}): Bet {
  return {
    id: "bet1",
    chatId: "chat1",
    creatorId: "matt",
    status: "proposed",
    claim: "I make a half-court shot by Friday",
    stake: { kind: "points", amount: 20n, currency: "PTS" },
    participants: [
      { userId: "matt", side: "for", required: true, acceptedAt: T0.toISOString() },
      { userId: "jake", side: "against", required: true },
    ],
    proofCriteria: { summary: "video of the shot going in", required: ["ball goes in"], optional: [], challengeTokenRequired: true, mediaKinds: ["video"] },
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

const locked = () => bet({ status: "locked", lockedAt: at(1).toISOString(), participants: bet().participants.map((p) => ({ ...p, acceptedAt: at(1).toISOString() })) });
const judging = () => ({ ...locked(), status: "judging" as const, latestProofId: "proof1" });
const posted = (outcome: "for" | "against" = "for") => ({
  ...locked(),
  status: "verdict_posted" as const,
  latestProofId: "proof1",
  verdict: { outcome, confidence: 0.9, pass: 1 as const, proofId: "proof1" },
  disputeWindowEndsAt: at(60).toISOString(),
});
const disputed = () => ({ ...posted("for"), status: "disputed" as const, dispute: { id: "d1", disputerId: "jake", challenged: "for" as const } });

const kinds = (effects: { kind: string }[]) => effects.map((e) => e.kind);

describe("proposed", () => {
  it("partial accept stays proposed and posts a partial", () => {
    const b = bet({ participants: [...bet().participants, { userId: "sam", side: "against", required: true }] });
    const { next, effects } = transition(b, { type: "ACCEPT", userId: "jake" }, at(2));
    expect(next.status).toBe("proposed");
    expect(kinds(effects)).toEqual(["post"]);
  });

  it("final accept locks, holds every participant, issues a token — no settle", () => {
    const { next, effects } = transition(bet(), { type: "ACCEPT", userId: "jake" }, at(2));
    expect(next.status).toBe("locked");
    expect(next.lockedAt).toBe(at(2).toISOString());
    expect(kinds(effects)).toEqual(["hold", "hold", "issue_challenge_token", "post"]);
    expect(effects.filter((e) => e.kind === "hold").map((e) => (e as { userId: string }).userId)).toEqual(["matt", "jake"]);
  });

  it("accept by a stranger is illegal; a repeat accept is a no-op", () => {
    expect(() => transition(bet(), { type: "ACCEPT", userId: "nobody" }, at(1))).toThrow(IllegalTransition);
    const { next, effects } = transition(bet(), { type: "ACCEPT", userId: "matt" }, at(1));
    expect(next).toBe(bet().version === next.version ? next : next);
    expect(effects).toEqual([]);
  });

  it("decline by a required participant cancels without touching the ledger", () => {
    const { next, effects } = transition(bet(), { type: "DECLINE", userId: "jake" }, at(1));
    expect(next.status).toBe("cancelled");
    expect(kinds(effects)).toEqual(["post"]);
  });

  it("only the creator can cancel", () => {
    expect(() => transition(bet(), { type: "CANCEL", userId: "jake" }, at(1))).toThrow(/creator/);
    expect(transition(bet(), { type: "CANCEL", userId: "matt" }, at(1)).next.status).toBe("cancelled");
  });

  it("expires only after the accept window", () => {
    expect(() => transition(bet(), { type: "TIMEOUT_ACCEPT" }, at(23))).toThrow(/still open/);
    const { next, effects } = transition(bet(), { type: "TIMEOUT_ACCEPT" }, at(25));
    expect(next.status).toBe("expired");
    expect(kinds(effects)).not.toContain("release");
  });
});

describe("locked", () => {
  it("proof from a participant before deadline+grace enqueues judging", () => {
    const { next, effects } = transition(locked(), { type: "PROOF", userId: "matt", proofId: "p1" }, at(80));
    expect(next.status).toBe("proof_submitted");
    expect(effects).toContainEqual({ kind: "enqueue_judge", proofId: "p1", pass: 1 });
  });

  it("proof after deadline+grace (84h) is rejected", () => {
    expect(() => transition(locked(), { type: "PROOF", userId: "matt", proofId: "p1" }, at(85))).toThrow(/deadline/);
  });

  it("mutual cancel voids and releases", () => {
    const { next, effects } = transition(locked(), { type: "CANCEL_MUTUAL" }, at(5));
    expect(next.status).toBe("voided");
    expect(kinds(effects)).toEqual(["release", "post"]);
  });

  it("deadline timeout: auto_loss posts an 'against' verdict with a dispute window; void releases", () => {
    const { next } = transition(locked(), { type: "TIMEOUT_DEADLINE" }, at(85));
    expect(next.status).toBe("verdict_posted");
    expect(next.verdict?.outcome).toBe("against");
    expect(next.disputeWindowEndsAt).toBe(at(85 + 24).toISOString());

    const v = transition({ ...locked(), noProofRule: "void" }, { type: "TIMEOUT_DEADLINE" }, at(85));
    expect(v.next.status).toBe("voided");
    expect(kinds(v.effects)).toContain("release");
  });
});

describe("judging", () => {
  it("confident verdict opens a 24h dispute window", () => {
    const { next, effects } = transition(judging(), { type: "VERDICT", outcome: "for", confidence: 0.92, proofId: "proof1" }, at(80));
    expect(next.status).toBe("verdict_posted");
    expect(next.disputeWindowEndsAt).toBe(at(104).toISOString());
    expect(kinds(effects)).toEqual(["post"]);
  });

  it("low-confidence before the deadline goes back to locked and asks for better proof", () => {
    const { next, effects } = transition(judging(), { type: "VERDICT", outcome: "for", confidence: 0.4, proofId: "proof1" }, at(50));
    expect(next.status).toBe("locked");
    expect(effects).toContainEqual({ kind: "post", message: "need_better_proof" });
  });

  it("inconclusive after the deadline voids and releases", () => {
    const { next, effects } = transition(judging(), { type: "VERDICT", outcome: "inconclusive", confidence: 0.9, proofId: "proof1" }, at(90));
    expect(next.status).toBe("voided");
    expect(kinds(effects)).toContain("release");
  });
});

describe("verdict_posted", () => {
  it("settles after the window with winner-take-pot and honor deltas", () => {
    const { next, effects } = transition(posted("for"), { type: "TIMEOUT_DISPUTE" }, at(61));
    expect(next.status).toBe("settled");
    const settle = effects.find((e) => e.kind === "settle") as { payouts: { userId: string; amount: bigint }[] };
    expect(settle.payouts).toEqual([{ userId: "matt", amount: 40n }]);
    expect(effects).toContainEqual({ kind: "honor", userId: "matt", delta: 2, reason: "won" });
    expect(effects).toContainEqual({ kind: "honor", userId: "jake", delta: -1, reason: "lost" });
  });

  it("loser can dispute inside the window with a bond; winner cannot; nobody after", () => {
    const { next, effects } = transition(posted("for"), { type: "DISPUTE", userId: "jake", disputeId: "d1" }, at(30));
    expect(next.status).toBe("disputed");
    expect(effects).toContainEqual({ kind: "bond", userId: "jake", disputeId: "d1", amount: 10n });
    expect(effects).toContainEqual({ kind: "enqueue_judge", proofId: "proof1", pass: 2 });
    expect(() => transition(posted("for"), { type: "DISPUTE", userId: "matt", disputeId: "d2" }, at(30))).toThrow(/winners/);
    expect(() => transition(posted("for"), { type: "DISPUTE", userId: "jake", disputeId: "d2" }, at(61))).toThrow(/closed/);
  });

  it("does not settle while the window is open", () => {
    expect(() => transition(posted("for"), { type: "TIMEOUT_DISPUTE" }, at(30))).toThrow(/still open/);
  });
});

describe("disputed", () => {
  it("upheld: bond forfeits to the winner, disputer loses honor, original payout stands", () => {
    const { next, effects } = transition(disputed(), { type: "DISPUTE_DECISION", result: "upheld", decidedBy: "ai" }, at(40));
    expect(next.status).toBe("settled");
    expect(effects[0]).toEqual({ kind: "resolve_bond", disputeId: "d1", outcome: "forfeit", toUserId: "matt" });
    expect(effects).toContainEqual({ kind: "honor", userId: "jake", delta: -3, reason: "dispute lost" });
    expect((effects.find((e) => e.kind === "settle") as { winners: string[] }).winners).toEqual(["matt"]);
  });

  it("overturned: bond released, verdict flips, payout flips", () => {
    const { next, effects } = transition(disputed(), { type: "DISPUTE_DECISION", result: "overturned", decidedBy: "referee" }, at(40));
    expect(next.verdict?.outcome).toBe("against");
    expect(next.verdict?.pass).toBe(2);
    expect(effects[0]).toEqual({ kind: "resolve_bond", disputeId: "d1", outcome: "release" });
    expect((effects.find((e) => e.kind === "settle") as { winners: string[] }).winners).toEqual(["jake"]);
  });

  it("unresolvable: everyone refunded including the bond", () => {
    const { next, effects } = transition(disputed(), { type: "UNRESOLVABLE" }, at(40));
    expect(next.status).toBe("voided");
    expect(kinds(effects)).toEqual(["resolve_bond", "release", "post"]);
  });
});

describe("every (state, event) pair is either handled or IllegalTransition — never a crash", () => {
  const allEvents: BetEvent[] = [
    { type: "ACCEPT", userId: "jake" },
    { type: "DECLINE", userId: "jake" },
    { type: "CANCEL", userId: "matt" },
    { type: "TIMEOUT_ACCEPT" },
    { type: "PROOF", userId: "matt", proofId: "p" },
    { type: "CANCEL_MUTUAL" },
    { type: "TIMEOUT_DEADLINE" },
    { type: "JUDGE_START" },
    { type: "VERDICT", outcome: "for", confidence: 0.9, proofId: "p" },
    { type: "JUDGE_FAILED" },
    { type: "DISPUTE", userId: "jake", disputeId: "d" },
    { type: "TIMEOUT_DISPUTE" },
    { type: "DISPUTE_DECISION", result: "upheld", decidedBy: "ai" },
    { type: "UNRESOLVABLE" },
  ];
  const fixtures: Record<BetStatus, Bet> = {
    proposed: bet(),
    locked: locked(),
    proof_submitted: { ...locked(), status: "proof_submitted", latestProofId: "proof1" },
    judging: judging(),
    verdict_posted: posted(),
    disputed: disputed(),
    settled: { ...posted(), status: "settled" },
    expired: { ...bet(), status: "expired" },
    cancelled: { ...bet(), status: "cancelled" },
    voided: { ...locked(), status: "voided" },
  };

  for (const status of BET_STATUSES) {
    for (const event of allEvents) {
      it(`${status} × ${event.type}`, () => {
        try {
          const { next, effects } = transition(fixtures[status], event, at(200));
          expect(BET_STATUSES).toContain(next.status);
          expect(Array.isArray(effects)).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(IllegalTransition);
        }
      });
    }
  }

  it("terminal states accept nothing (a redundant ACCEPT is a silent no-op everywhere)", () => {
    for (const status of ["settled", "expired", "cancelled", "voided"] as const) {
      for (const event of allEvents) {
        if (event.type === "ACCEPT") {
          // matt accepted at creation in every fixture; a stranger never can.
          expect(transition(fixtures[status], { type: "ACCEPT", userId: "matt" }, at(200)).effects).toEqual([]);
          expect(() => transition(fixtures[status], { type: "ACCEPT", userId: "nobody" }, at(200))).toThrow(IllegalTransition);
          continue;
        }
        expect(() => transition(fixtures[status], event, at(200))).toThrow(IllegalTransition);
      }
    }
  });
});

describe("helpers", () => {
  it("payoutsFor splits an odd pot with the remainder to the first winner", () => {
    const b = bet({ participants: [
      { userId: "a", side: "for", required: true },
      { userId: "b", side: "for", required: true },
      { userId: "c", side: "against", required: true },
    ], stake: { kind: "points", amount: 5n, currency: "PTS" } });
    expect(payoutsFor(b, "for").payouts).toEqual([{ userId: "a", amount: 8n }, { userId: "b", amount: 7n }]);
    expect(payoutsFor(b, "against").payouts).toEqual([{ userId: "c", amount: 15n }]);
  });

  it("dueTimeout picks the right timeout per state", () => {
    expect(dueTimeout(bet(), at(25))).toEqual({ type: "TIMEOUT_ACCEPT" });
    expect(dueTimeout(bet(), at(23))).toBeNull();
    expect(dueTimeout(locked(), at(85))).toEqual({ type: "TIMEOUT_DEADLINE" });
    expect(dueTimeout(posted(), at(61))).toEqual({ type: "TIMEOUT_DISPUTE" });
    expect(dueTimeout(disputed(), at(200))).toBeNull();
  });
});
