import type { Payout } from "@/src/ledger/types";
import {
  DISPUTE_WINDOW_HOURS,
  MIN_JUDGE_CONFIDENCE,
  REFEREE_SILENCE_HOURS,
  type Bet,
  type BetStatus,
  type Outcome,
  type Participant,
  type Side,
} from "./types";

/** Events the engine feeds the machine. Each names who/what triggered it. */
export type BetEvent =
  | { type: "ACCEPT"; userId: string }
  | { type: "JOIN"; userId: string; side: Side }
  | { type: "DECLINE"; userId: string }
  | { type: "CANCEL"; userId: string }
  | { type: "TIMEOUT_ACCEPT" }
  | { type: "PROOF"; userId: string; proofId: string }
  | { type: "CANCEL_MUTUAL" }
  | { type: "TIMEOUT_DEADLINE" }
  | { type: "JUDGE_START" }
  | { type: "VERDICT"; outcome: Outcome; confidence: number; proofId: string }
  | { type: "JUDGE_FAILED" }
  | { type: "DISPUTE"; userId: string; disputeId: string; reason?: string }
  | { type: "TIMEOUT_DISPUTE" }
  | { type: "DISPUTE_DECISION"; result: "upheld" | "overturned"; decidedBy: "referee" | "ai" }
  | { type: "UNRESOLVABLE" };

/** Declarative side effects. The engine executes them; tests assert on them. */
export type Effect =
  | { kind: "hold"; userId: string }
  | { kind: "release" }
  | { kind: "settle"; payouts: Payout[]; winners: string[]; losers: string[] }
  | { kind: "bond"; userId: string; disputeId: string; amount: bigint }
  | { kind: "resolve_bond"; disputeId: string; outcome: "forfeit" | "release"; toUserId?: string }
  | { kind: "issue_challenge_token" }
  | { kind: "post"; message: PostKind }
  | { kind: "honor"; userId: string; delta: number; reason: string }
  | { kind: "enqueue_judge"; proofId: string; pass: 1 | 2; reason?: string };

export type PostKind =
  | "accepted_partial"
  | "locked"
  | "declined"
  | "cancelled"
  | "expired"
  | "proof_received"
  | "need_better_proof"
  | "verdict"
  | "auto_loss"
  | "voided"
  | "disputed"
  | "settled"
  | "judge_failed";

export interface Transition {
  next: Bet;
  effects: Effect[];
}

export class IllegalTransition extends Error {
  constructor(status: BetStatus, event: BetEvent["type"], detail?: string) {
    super(`cannot ${event} from ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "IllegalTransition";
  }
}

const hours = (h: number) => h * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

export function proofDeadlineMs(bet: Bet): number {
  return Date.parse(bet.deadlineAt) + hours(bet.proofGraceHours);
}

function participant(bet: Bet, userId: string): Participant | undefined {
  return bet.participants.find((p) => p.userId === userId);
}

export function winningSideOf(outcome: Exclude<Outcome, "inconclusive">): Side {
  return outcome;
}

/** Split the pot equally among winners; remainder goes to the first winner. */
export function payoutsFor(bet: Bet, outcome: Exclude<Outcome, "inconclusive">): Extract<Effect, { kind: "settle" }> {
  const side = winningSideOf(outcome);
  const winners = bet.participants.filter((p) => p.side === side).map((p) => p.userId);
  const losers = bet.participants.filter((p) => p.side !== side).map((p) => p.userId);
  const pot = bet.stake.amount * BigInt(bet.participants.length);
  if (winners.length === 0 || pot === 0n) return { kind: "settle", payouts: [], winners, losers };
  const share = pot / BigInt(winners.length);
  const remainder = pot - share * BigInt(winners.length);
  const payouts: Payout[] = winners.map((userId, i) => ({ userId, amount: share + (i === 0 ? remainder : 0n) }));
  return { kind: "settle", payouts, winners, losers };
}

function settleEffects(bet: Bet, outcome: Exclude<Outcome, "inconclusive">): Effect[] {
  const settle = payoutsFor(bet, outcome);
  return [
    settle,
    ...settle.winners.map((userId): Effect => ({ kind: "honor", userId, delta: +2, reason: "won" })),
    ...settle.losers.map((userId): Effect => ({ kind: "honor", userId, delta: -1, reason: "lost" })),
    { kind: "post", message: "settled" },
  ];
}

export function bondAmount(bet: Bet): bigint {
  const half = (bet.stake.amount * BigInt(Math.round(100 * 0.5))) / 100n;
  return half > 0n ? half : 1n;
}

/**
 * Pure transition function. Never touches a database or a clock beyond the
 * `now` it is handed, which is what makes every (state, event) pair testable
 * in isolation. The engine is responsible for terms checks and persistence.
 */
export function transition(bet: Bet, event: BetEvent, now: Date): Transition {
  const nowMs = now.getTime();
  const bump = (patch: Partial<Bet>): Bet => ({ ...bet, ...patch, version: bet.version + 1 });

  // A repeated 👍 from someone who already accepted carries no information,
  // whatever state the bet is in (late tapbacks arrive after the lock).
  if (event.type === "ACCEPT" && participant(bet, event.userId)?.acceptedAt) {
    return { next: bet, effects: [] };
  }

  switch (bet.status) {
    case "proposed": {
      if (event.type === "JOIN") {
        if (participant(bet, event.userId)) throw new IllegalTransition(bet.status, event.type, "already in");
        if (!bet.open) throw new IllegalTransition(bet.status, event.type, "bet is not open");
        const joined: Bet = { ...bet, participants: [...bet.participants, { userId: event.userId, side: event.side, required: true }] };
        return transition(joined, { type: "ACCEPT", userId: event.userId }, now);
      }
      if (event.type === "ACCEPT") {
        const p = participant(bet, event.userId);
        if (!p) throw new IllegalTransition(bet.status, event.type, "not a participant");
        if (p.acceptedAt) return { next: bet, effects: [] };
        const participants = bet.participants.map((x) =>
          x.userId === event.userId ? { ...x, acceptedAt: now.toISOString() } : x
        );
        const allIn = participants.filter((x) => x.required).every((x) => x.acceptedAt);
        if (!allIn) {
          return { next: bump({ participants }), effects: [{ kind: "post", message: "accepted_partial" }] };
        }
        return {
          next: bump({ participants, status: "locked", lockedAt: now.toISOString() }),
          effects: [
            ...participants.map((x): Effect => ({ kind: "hold", userId: x.userId })),
            { kind: "issue_challenge_token" },
            { kind: "post", message: "locked" },
          ],
        };
      }
      if (event.type === "DECLINE") {
        const p = participant(bet, event.userId);
        if (!p?.required) throw new IllegalTransition(bet.status, event.type, "not a required participant");
        return { next: bump({ status: "cancelled", resolvedAt: now.toISOString() }), effects: [{ kind: "post", message: "declined" }] };
      }
      if (event.type === "CANCEL") {
        if (event.userId !== bet.creatorId) throw new IllegalTransition(bet.status, event.type, "only the creator can cancel");
        return { next: bump({ status: "cancelled", resolvedAt: now.toISOString() }), effects: [{ kind: "post", message: "cancelled" }] };
      }
      if (event.type === "TIMEOUT_ACCEPT") {
        if (nowMs <= Date.parse(bet.acceptByAt)) throw new IllegalTransition(bet.status, event.type, "accept window still open");
        return { next: bump({ status: "expired", resolvedAt: now.toISOString() }), effects: [{ kind: "post", message: "expired" }] };
      }
      break;
    }

    case "locked": {
      if (event.type === "PROOF") {
        if (!participant(bet, event.userId)) throw new IllegalTransition(bet.status, event.type, "not a participant");
        if (nowMs > proofDeadlineMs(bet)) throw new IllegalTransition(bet.status, event.type, "past deadline");
        return {
          next: bump({ status: "proof_submitted", latestProofId: event.proofId }),
          effects: [{ kind: "post", message: "proof_received" }, { kind: "enqueue_judge", proofId: event.proofId, pass: 1 }],
        };
      }
      if (event.type === "CANCEL_MUTUAL") {
        return { next: bump({ status: "voided", resolvedAt: now.toISOString() }), effects: [{ kind: "release" }, { kind: "post", message: "voided" }] };
      }
      if (event.type === "TIMEOUT_DEADLINE") {
        if (nowMs <= proofDeadlineMs(bet)) throw new IllegalTransition(bet.status, event.type, "deadline not passed");
        if (bet.noProofRule === "void") {
          return { next: bump({ status: "voided", resolvedAt: now.toISOString() }), effects: [{ kind: "release" }, { kind: "post", message: "voided" }] };
        }
        // No proof = the "for" side failed to deliver.
        return {
          next: bump({
            status: "verdict_posted",
            verdict: { outcome: "against", confidence: 1, pass: 1 },
            disputeWindowEndsAt: iso(nowMs + hours(DISPUTE_WINDOW_HOURS)),
          }),
          effects: [{ kind: "post", message: "auto_loss" }],
        };
      }
      break;
    }

    case "proof_submitted": {
      if (event.type === "JUDGE_START") return { next: bump({ status: "judging" }), effects: [] };
      if (event.type === "PROOF") {
        // A second attachment before judging starts just replaces the pending one.
        return { next: bump({ latestProofId: event.proofId }), effects: [{ kind: "enqueue_judge", proofId: event.proofId, pass: 1 }] };
      }
      break;
    }

    case "judging": {
      if (event.type === "VERDICT") {
        const decisive = event.outcome !== "inconclusive" && event.confidence >= MIN_JUDGE_CONFIDENCE;
        if (decisive) {
          return {
            next: bump({
              status: "verdict_posted",
              verdict: { outcome: event.outcome as "for" | "against", confidence: event.confidence, pass: 1, proofId: event.proofId },
              disputeWindowEndsAt: iso(nowMs + hours(DISPUTE_WINDOW_HOURS)),
            }),
            effects: [{ kind: "post", message: "verdict" }],
          };
        }
        if (nowMs <= proofDeadlineMs(bet)) {
          return { next: bump({ status: "locked" }), effects: [{ kind: "post", message: "need_better_proof" }] };
        }
        return { next: bump({ status: "voided", resolvedAt: now.toISOString() }), effects: [{ kind: "release" }, { kind: "post", message: "voided" }] };
      }
      if (event.type === "JUDGE_FAILED") {
        return { next: bump({ status: "locked" }), effects: [{ kind: "post", message: "judge_failed" }] };
      }
      break;
    }

    case "verdict_posted": {
      const verdict = bet.verdict;
      if (!verdict) throw new IllegalTransition(bet.status, event.type, "verdict missing");
      if (event.type === "DISPUTE") {
        const p = participant(bet, event.userId);
        const isReferee = bet.refereeUserId === event.userId;
        if (!p && !isReferee) throw new IllegalTransition(bet.status, event.type, "not a participant");
        if (p && p.side === winningSideOf(verdict.outcome)) throw new IllegalTransition(bet.status, event.type, "winners cannot dispute");
        if (bet.disputeWindowEndsAt && nowMs > Date.parse(bet.disputeWindowEndsAt)) {
          throw new IllegalTransition(bet.status, event.type, "dispute window closed");
        }
        return {
          next: bump({
            status: "disputed",
            dispute: { id: event.disputeId, disputerId: event.userId, challenged: verdict.outcome, reason: event.reason, openedAt: now.toISOString() },
          }),
          effects: [
            { kind: "bond", userId: event.userId, disputeId: event.disputeId, amount: bondAmount(bet) },
            { kind: "post", message: "disputed" },
            ...(bet.latestProofId ? [{ kind: "enqueue_judge", proofId: bet.latestProofId, pass: 2, reason: event.reason } as Effect] : []),
          ],
        };
      }
      if (event.type === "TIMEOUT_DISPUTE") {
        if (bet.disputeWindowEndsAt && nowMs <= Date.parse(bet.disputeWindowEndsAt)) {
          throw new IllegalTransition(bet.status, event.type, "dispute window still open");
        }
        return { next: bump({ status: "settled", resolvedAt: now.toISOString() }), effects: settleEffects(bet, verdict.outcome) };
      }
      break;
    }

    case "disputed": {
      const { dispute, verdict } = bet;
      if (!dispute || !verdict) throw new IllegalTransition(bet.status, event.type, "dispute state missing");
      if (event.type === "DISPUTE_DECISION") {
        if (event.result === "upheld") {
          const winner = bet.participants.find((p) => p.side === winningSideOf(verdict.outcome))?.userId;
          return {
            next: bump({ status: "settled", resolvedAt: now.toISOString() }),
            effects: [
              { kind: "resolve_bond", disputeId: dispute.id, outcome: "forfeit", toUserId: winner },
              { kind: "honor", userId: dispute.disputerId, delta: -3, reason: "dispute lost" },
              ...settleEffects(bet, verdict.outcome),
            ],
          };
        }
        const flipped: "for" | "against" = verdict.outcome === "for" ? "against" : "for";
        const next = bump({
          status: "settled",
          resolvedAt: now.toISOString(),
          verdict: { ...verdict, outcome: flipped, pass: 2 },
        });
        return {
          next,
          effects: [
            { kind: "resolve_bond", disputeId: dispute.id, outcome: "release" },
            { kind: "honor", userId: dispute.disputerId, delta: +1, reason: "dispute won" },
            ...settleEffects(next, flipped),
          ],
        };
      }
      if (event.type === "UNRESOLVABLE") {
        return {
          next: bump({ status: "voided", resolvedAt: now.toISOString() }),
          effects: [{ kind: "resolve_bond", disputeId: dispute.id, outcome: "release" }, { kind: "release" }, { kind: "post", message: "voided" }],
        };
      }
      break;
    }

    case "settled":
    case "expired":
    case "cancelled":
    case "voided":
      break;
  }

  throw new IllegalTransition(bet.status, event.type);
}

/** Which timeout event, if any, is due for a bet at `now`. Used by the cron tick. */
export function dueTimeout(bet: Bet, now: Date): BetEvent | null {
  const nowMs = now.getTime();
  if (bet.status === "proposed" && nowMs > Date.parse(bet.acceptByAt)) return { type: "TIMEOUT_ACCEPT" };
  if (bet.status === "locked" && nowMs > proofDeadlineMs(bet)) return { type: "TIMEOUT_DEADLINE" };
  if (bet.status === "verdict_posted" && bet.disputeWindowEndsAt && nowMs > Date.parse(bet.disputeWindowEndsAt)) {
    return { type: "TIMEOUT_DISPUTE" };
  }
  // A human referee who never answers must not hold stakes forever.
  if (bet.status === "disputed" && bet.judgeKind === "referee" && bet.dispute && nowMs > Date.parse(bet.dispute.openedAt) + hours(REFEREE_SILENCE_HOURS)) {
    return { type: "UNRESOLVABLE" };
  }
  return null;
}
