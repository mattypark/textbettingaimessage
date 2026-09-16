import type { BetEngine } from "@/src/bets/engine";
import type { BetStore } from "@/src/bets/store";
import { runTimeouts, type TimeoutReport } from "@/src/bets/timeouts";
import type { Store } from "@/src/db/store";
import type { InboundPipeline } from "@/src/inbound/pipeline";
import type { Outbox } from "@/src/transport/outbox";
import type { ProofStore } from "@/src/proof/store";

export interface TickDeps {
  store: Store;
  betStore: BetStore;
  engine: BetEngine;
  outbox: Outbox;
  pipeline: InboundPipeline;
  proofStore?: ProofStore;
  /** Job kind → runner. Judge is registered by the wiring; absent kinds wait. */
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
  jobs: 3,
};

export interface TickReport {
  effectsReplayed: number;
  outboxSent: number;
  outboxFailed: number;
  inboxReprocessed: number;
  jobsRun: number;
  jobsFailed: number;
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

  let jobsRun = 0;
  let jobsFailed = 0;
  if (deps.proofStore && deps.jobRunners) {
    for (const [kind, run] of Object.entries(deps.jobRunners)) {
      for (const job of await deps.proofStore.claimJobs(kind, limits.jobs, limits.maxAttempts)) {
        try {
          await run(job.payload);
          await deps.proofStore.finishJob(job.id, true);
          jobsRun += 1;
        } catch (error) {
          await deps.proofStore.finishJob(job.id, false, error instanceof Error ? error.message : String(error));
          jobsFailed += 1;
        }
      }
    }
  }

  const timeouts = await runTimeouts(deps.betStore, deps.engine, now, limits.timeouts);

  return { effectsReplayed, outboxSent, outboxFailed, inboxReprocessed, jobsRun, jobsFailed, timeouts, ms: Date.now() - started };
}
