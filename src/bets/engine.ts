import { randomInt } from "node:crypto";
import type { Ledger } from "@/src/ledger/types";
import type { OutboundMessage } from "@/src/transport/types";
import { postText, type Names } from "./card";
import { transition, type BetEvent, type Effect } from "./state-machine";
import { VersionConflict, type BetStore } from "./store";
import type { Bet } from "./types";

export interface Poster {
  (chatId: string, message: OutboundMessage, idempotencyKey: string): Promise<unknown>;
}

export interface EngineDeps {
  store: BetStore;
  ledger: Ledger;
  post: Poster;
  names: Names;
  clock?: () => Date;
  log?: (line: string, extra?: Record<string, unknown>) => void;
}

const TOKEN_WORDS = ["mango", "comet", "walrus", "pickle", "saturn", "banjo", "tundra", "velvet", "cactus", "orbit", "maple", "falcon"];

export function challengeToken(): string {
  return `${TOKEN_WORDS[randomInt(TOKEN_WORDS.length)]}-${randomInt(10, 99)}`;
}

/**
 * Applies events to bets: run the pure machine, persist under an optimistic
 * version check, then execute effects with idempotent keys. A crash after
 * the write leaves the transition marked incomplete; `replayIncomplete`
 * re-executes it safely because every effect is keyed on (bet, version).
 */
export class BetEngine {
  private readonly clock: () => Date;
  private readonly log: NonNullable<EngineDeps["log"]>;

  constructor(private readonly deps: EngineDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
  }

  async apply(betId: string, event: BetEvent, attempt = 0): Promise<Bet> {
    const bet = await this.deps.store.get(betId);
    if (!bet) throw new Error(`bet ${betId} not found`);

    const { next, effects } = transition(bet, event, this.clock());
    if (next === bet) return bet; // no-op (e.g. repeated ACCEPT)

    try {
      await this.deps.store.applyTransition(bet.version, next, {
        betId,
        fromStatus: bet.status,
        toStatus: next.status,
        event,
        effects,
      });
    } catch (error) {
      if (error instanceof VersionConflict && attempt < 5) return this.apply(betId, event, attempt + 1);
      throw error;
    }

    const finalBet = await this.execute(next, effects);
    await this.deps.store.markEffectsDone(betId, next.version);
    return finalBet;
  }

  wallet(userId: string) {
    return this.deps.ledger.wallet(userId);
  }

  /** Re-run effects for transitions that were written but never completed. */
  async replayIncomplete(limit = 20): Promise<number> {
    const pending = await this.deps.store.incompleteTransitions(limit);
    for (const record of pending) {
      await this.execute(record.bet, record.effects);
      await this.deps.store.markEffectsDone(record.betId, record.version);
    }
    return pending.length;
  }

  private async execute(bet: Bet, effects: Effect[]): Promise<Bet> {
    let current = bet;
    const key = (suffix: string) => `bet:${bet.id}:v${bet.version}:${suffix}`;

    for (const [index, effect] of effects.entries()) {
      switch (effect.kind) {
        case "hold":
          await this.deps.ledger.hold({ betId: bet.id, userId: effect.userId, stake: bet.stake, idem: `hold:${bet.id}:${effect.userId}` });
          break;
        case "release":
          await this.deps.ledger.release({ betId: bet.id, idem: key("release") });
          break;
        case "settle":
          await this.deps.ledger.settle({ betId: bet.id, payouts: effect.payouts, idem: key("settle") });
          break;
        case "bond":
          await this.deps.ledger.bond({ betId: bet.id, disputeId: effect.disputeId, userId: effect.userId, amount: effect.amount, idem: `bond:${effect.disputeId}` });
          break;
        case "resolve_bond":
          await this.deps.ledger.resolveBond({ disputeId: effect.disputeId, outcome: effect.outcome, toUserId: effect.toUserId, idem: `resolve_bond:${effect.disputeId}` });
          break;
        case "issue_challenge_token": {
          if (!current.challengeToken) {
            const token = challengeToken();
            await this.deps.store.setChallengeToken(bet.id, token);
            current = { ...current, challengeToken: token };
          }
          break;
        }
        case "post":
          await this.deps.post(bet.chatId, { text: postText(effect.message, current, this.deps.names), effect: effect.message === "settled" ? "confetti" : undefined }, key(`post:${index}`));
          break;
        case "honor":
          await this.deps.store.addHonor(effect.userId, bet.id, effect.delta, effect.reason);
          break;
        case "enqueue_judge":
          await this.deps.store.enqueueJudge(bet.id, effect.proofId, effect.pass, effect.reason);
          break;
      }
      this.log("effect", { betId: bet.id, version: bet.version, effect: effect.kind });
    }
    return current;
  }
}
