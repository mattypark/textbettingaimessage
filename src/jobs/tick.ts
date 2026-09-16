import type { BetEngine } from "@/src/bets/engine";
import type { BetStore } from "@/src/bets/store";
import { runTimeouts, type TimeoutReport } from "@/src/bets/timeouts";
import type { Store } from "@/src/db/store";
import type { InboundPipeline } from "@/src/inbound/pipeline";
import type { Outbox } from "@/src/transport/outbox";

export interface TickDeps {
  store: Store;
  betStore: BetStore;
  engine: BetEngine;
  outbox: Outbox;
  pipeline: InboundPipeline;
  /** Stage 7 registers the judge here; until then judge jobs wait. */
  jobRunners?: Record<string, (payload: Record<string, unknown>) => Promise<void>>;
  clock?: () => Date;
  limits?: Partial<typeof DEFAULT_LIMITS>;
}

export const DEFAULT_LIMITS = {
  outbox: 20,
  inbox: 10,
  inboxStaleMs: 90_000,
  maxAttempts: 3,
  timeouts: 50,
  effects: 20,
};

export interface TickReport {
  effectsReplayed: number;
  outboxSent: number;
  outboxFailed: number;
  inboxReprocessed: number;
  timeouts: TimeoutReport;
  ms: number;
}

/**
 * The once-a-minute sweep. Every step is bounded so the whole tick fits in
 * one serverless invocation, and every step is idempotent so overlapping
 * ticks can't double-send or double-pay.
 */
export async function tick(deps: TickDeps): Promise<TickReport> {
  const started = Date.now();
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const now = deps.clock?.() ?? new Date();

  const effectsReplayed = await deps.engine.replayIncomplete(limits.effects);

  let outboxSent = 0;
  let outboxFailed = 0;
  for (const row of await deps.store.queuedOutbound(limits.outbox, limits.maxAttempts)) {
    try {
      await deps.outbox.deliver(row.id, row.chatId, row.body);
      outboxSent += 1;
    } catch {
      outboxFailed += 1;
    }
  }

  let inboxReprocessed = 0;
  for (const row of await deps.store.stuckInbound(limits.inboxStaleMs, limits.inbox, limits.maxAttempts)) {
    await deps.store.bumpInboundAttempt(row.id);
    await deps.pipeline.process(row.id, row.event);
    inboxReprocessed += 1;
  }

  const timeouts = await runTimeouts(deps.betStore, deps.engine, now, limits.timeouts);

  return { effectsReplayed, outboxSent, outboxFailed, inboxReprocessed, timeouts, ms: Date.now() - started };
}
