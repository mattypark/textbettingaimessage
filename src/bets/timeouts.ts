import type { BetEngine } from "./engine";
import { dueTimeout, IllegalTransition } from "./state-machine";
import type { BetStore } from "./store";

export interface TimeoutReport {
  scanned: number;
  advanced: string[];
  errors: Array<{ betId: string; error: string }>;
}

/**
 * Advances every bet whose clock has run out: unaccepted → expired, past
 * deadline → auto-loss/void, dispute window closed → settled. Safe to run
 * every minute; a bet that is not due is skipped.
 */
export async function runTimeouts(store: BetStore, engine: BetEngine, now: Date, limit = 50): Promise<TimeoutReport> {
  const bets = await store.betsWithPendingTimeouts(limit);
  const report: TimeoutReport = { scanned: bets.length, advanced: [], errors: [] };
  for (const bet of bets) {
    const event = dueTimeout(bet, now);
    if (!event) continue;
    try {
      await engine.apply(bet.id, event);
      report.advanced.push(`${bet.id}:${event.type}`);
    } catch (error) {
      if (error instanceof IllegalTransition) continue; // raced with a webhook; fine
      report.errors.push({ betId: bet.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
