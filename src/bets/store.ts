import type { Bet } from "./types";
import type { BetEvent, Effect } from "./state-machine";

export class VersionConflict extends Error {
  constructor(betId: string) {
    super(`bet ${betId} changed underneath us`);
    this.name = "VersionConflict";
  }
}

export interface TransitionRecord {
  betId: string;
  fromStatus: Bet["status"];
  toStatus: Bet["status"];
  event: BetEvent;
  effects: Effect[];
  version: number;
  effectsCompletedAt?: string;
}

/**
 * Persistence for bets. `applyTransition` must be atomic and guarded by the
 * expected version: two webhooks accepting the same bet at once both compute
 * a transition, but only one write lands; the other gets VersionConflict,
 * reloads, and recomputes (its ACCEPT is then a no-op).
 */
export interface BetStore {
  create(bet: Bet): Promise<Bet>;
  get(betId: string): Promise<Bet | null>;
  applyTransition(expectedVersion: number, next: Bet, record: Omit<TransitionRecord, "version">): Promise<void>;
  markEffectsDone(betId: string, version: number): Promise<void>;
  setChallengeToken(betId: string, token: string): Promise<void>;
  openBetsInChat(chatId: string): Promise<Bet[]>;
  /** Bets whose status could be time-advanced, for the cron tick. */
  betsWithPendingTimeouts(limit: number): Promise<Bet[]>;
  /** Transitions whose effects never finished (crash between write and execute). */
  incompleteTransitions(limit: number): Promise<Array<TransitionRecord & { bet: Bet }>>;
  addHonor(userId: string, betId: string, delta: number, reason: string): Promise<void>;
  enqueueJudge(betId: string, proofId: string, pass: 1 | 2): Promise<void>;
}

export class MemoryBetStore implements BetStore {
  readonly bets = new Map<string, Bet>();
  readonly records: TransitionRecord[] = [];
  readonly honor: Array<{ userId: string; betId: string; delta: number; reason: string }> = [];
  readonly judgeQueue: Array<{ betId: string; proofId: string; pass: 1 | 2 }> = [];

  async create(bet: Bet): Promise<Bet> {
    this.bets.set(bet.id, bet);
    return bet;
  }

  async get(betId: string): Promise<Bet | null> {
    return this.bets.get(betId) ?? null;
  }

  async applyTransition(expectedVersion: number, next: Bet, record: Omit<TransitionRecord, "version">): Promise<void> {
    const current = this.bets.get(next.id);
    if (!current || current.version !== expectedVersion) throw new VersionConflict(next.id);
    this.bets.set(next.id, next);
    this.records.push({ ...record, version: next.version });
  }

  async markEffectsDone(betId: string, version: number): Promise<void> {
    const record = this.records.find((r) => r.betId === betId && r.version === version);
    if (record) record.effectsCompletedAt = new Date().toISOString();
  }

  async setChallengeToken(betId: string, token: string): Promise<void> {
    const bet = this.bets.get(betId);
    if (bet) this.bets.set(betId, { ...bet, challengeToken: token });
  }

  async openBetsInChat(chatId: string): Promise<Bet[]> {
    return [...this.bets.values()].filter(
      (b) => b.chatId === chatId && !["settled", "expired", "cancelled", "voided"].includes(b.status)
    );
  }

  async betsWithPendingTimeouts(limit: number): Promise<Bet[]> {
    return [...this.bets.values()]
      .filter((b) => ["proposed", "locked", "verdict_posted"].includes(b.status))
      .slice(0, limit);
  }

  async incompleteTransitions(limit: number): Promise<Array<TransitionRecord & { bet: Bet }>> {
    return this.records
      .filter((r) => !r.effectsCompletedAt)
      .slice(0, limit)
      .map((r) => ({ ...r, bet: this.bets.get(r.betId)! }));
  }

  async addHonor(userId: string, betId: string, delta: number, reason: string): Promise<void> {
    this.honor.push({ userId, betId, delta, reason });
  }

  async enqueueJudge(betId: string, proofId: string, pass: 1 | 2): Promise<void> {
    this.judgeQueue.push({ betId, proofId, pass });
  }
}
