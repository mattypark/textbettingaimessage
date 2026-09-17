import { accessGate } from "@/src/access/gate";
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from "@/src/access/rate-limit";
import { MemoryAccessStore, SupabaseAccessStore, type AccessStore } from "@/src/access/store";
import { agentHandler } from "@/src/agent/handler";
import { modelClassifier } from "@/src/agent/classifier";
import { BetEngine } from "@/src/bets/engine";
import { runReminders } from "@/src/bets/reminders";
import { MemoryBetStore, type BetStore } from "@/src/bets/store";
import { SupabaseBetStore } from "@/src/bets/supabase-store";
import { botNames, env } from "@/src/config/env";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/src/db/admin";
import { MemoryStore } from "@/src/db/memory-store";
import { namesFor } from "@/src/db/names";
import type { Store } from "@/src/db/store";
import { SupabaseStore } from "@/src/db/supabase-store";
import { createLedger } from "@/src/ledger";
import { awaitsProof } from "@/src/proof/intake";
import { createModel } from "@/src/model";
import { modelJudge } from "@/src/proof/judge";
import { MemoryMediaStore, SupabaseMediaStore, type MediaStore } from "@/src/proof/media-store";
import { renderVideoFrames } from "@/src/proof/frames";
import { runJudgeJob } from "@/src/proof/run-judge";
import { MemoryProofStore, SupabaseProofStore, type ProofStore } from "@/src/proof/store";
import { introMessage } from "@/src/onboarding/terms";
import { fundingHooks } from "@/src/settle/funding";
import { settleUpFor } from "@/src/settle/settle-up";
import { createTransport } from "@/src/transport";
import { Outbox } from "@/src/transport/outbox";
import type { TransportName } from "@/src/transport/types";
import { InboundPipeline } from "./pipeline";

let memoryStore: MemoryStore | undefined;
let memoryBetStore: MemoryBetStore | undefined;
let memoryProofStore: MemoryProofStore | undefined;
let memoryAccess: MemoryAccessStore | undefined;

export function defaultAccessStore(): AccessStore {
  if (isSupabaseAdminConfigured()) return new SupabaseAccessStore(supabaseAdmin());
  memoryAccess ??= new MemoryAccessStore();
  return memoryAccess;
}
let memoryRateLimiter: MemoryRateLimiter | undefined;

/** Shared counters in Postgres when configured; per-process otherwise. */
export function defaultRateLimiter(): RateLimiter {
  if (isSupabaseAdminConfigured()) return new SupabaseRateLimiter(supabaseAdmin());
  memoryRateLimiter ??= new MemoryRateLimiter();
  return memoryRateLimiter;
}
let memoryMedia: MemoryMediaStore | undefined;

export function defaultProofStore(): ProofStore {
  if (isSupabaseAdminConfigured()) return new SupabaseProofStore(supabaseAdmin());
  memoryProofStore ??= new MemoryProofStore();
  return memoryProofStore;
}

export function defaultMediaStore(): MediaStore {
  if (isSupabaseAdminConfigured()) return new SupabaseMediaStore(supabaseAdmin());
  memoryMedia ??= new MemoryMediaStore();
  return memoryMedia;
}

/** Supabase when configured; in-process memory stores otherwise (dev without a DB). */
export function defaultStore(): Store {
  if (isSupabaseAdminConfigured()) return new SupabaseStore(supabaseAdmin());
  memoryStore ??= new MemoryStore();
  return memoryStore;
}

export function defaultBetStore(): BetStore {
  if (isSupabaseAdminConfigured()) return new SupabaseBetStore(supabaseAdmin());
  if (!memoryBetStore) {
    memoryBetStore = new MemoryBetStore();
    const proofs = defaultProofStore() as MemoryProofStore;
    memoryBetStore.jobSink = (kind, payload) => proofs.enqueue(kind, payload);
  }
  return memoryBetStore;
}

const names = (userId: string) => userId.slice(0, 8);

interface Wiring {
  store: Store;
  betStore: BetStore;
  proofStore: ProofStore;
  media: MediaStore;
  outbox: Outbox;
  engine: BetEngine;
  pipeline: InboundPipeline;
  jobRunners: Record<string, (payload: Record<string, unknown>) => Promise<void>>;
}

const wirings = new Map<TransportName, Wiring>();

export function tickDeps() {
  const w = wire(env().TRANSPORT);
  return {
    store: w.store,
    betStore: w.betStore,
    engine: w.engine,
    outbox: w.outbox,
    pipeline: w.pipeline,
    proofStore: w.proofStore,
    jobRunners: w.jobRunners,
    promote: () => defaultAccessStore().promote(3),
    remind: (now: Date) => runReminders({ store: w.betStore, post: (c, m, k) => w.outbox.send(c, m, k), namesFor: namesFor(w.store) }, now),
  };
}

export function pipelineFor(transportName: TransportName): InboundPipeline {
  return wire(transportName).pipeline;
}

function wire(transportName: TransportName): Wiring {
  const existing = wirings.get(transportName);
  if (existing) return existing;
  const store = defaultStore();
  const betStore = defaultBetStore();
  const proofStore = defaultProofStore();
  const media = defaultMediaStore();
  const transport = createTransport(transportName);
  const outbox = new Outbox(store, transport);
  const engine = new BetEngine({
    store: betStore,
    ledger: createLedger(),
    post: (chatId, message, key) => outbox.send(chatId, message, key),
    names,
    namesFor: namesFor(store),
    log: (line, extra) => console.info(`[engine] ${line}`, extra ?? ""),
    settleUp: env().SETTLE_UP === "0" ? undefined : settleUpFor(store),
    fundingRequest: env().SETTLE_UP === "0" ? undefined : fundingHooks(store).fundingRequest,
  });
  const ledger = createLedger();
  const model = createModel();
  const botName = botNames()[0] ?? "mushy";
  const pipeline = new InboundPipeline({
    store,
    transport,
    handler: agentHandler({
      store,
      betStore,
      engine,
      ledger,
      siteUrl: env().NEXT_PUBLIC_SITE_URL,
      botName,
      access: defaultAccessStore(),
      model: env().MODEL_MODE === "off" ? undefined : model,
      modelMode: env().MODEL_MODE,
      judgeMode: env().JUDGE_MODE,
      classifier: model && env().MODEL_MODE !== "off" ? modelClassifier(model) : undefined,
      intake: { proofStore, media, judgeMode: env().JUDGE_MODE },
    }),
    media,
    // The intro carries the bot's contact card so one tap names it in the group.
    introMessage: () => ({ text: introMessage(botName, env().NEXT_PUBLIC_SITE_URL), attachments: [{ contactCard: true }] }),
    turnLimit: { limiter: defaultRateLimiter(), perUserPerHour: env().BOT_TURNS_PER_USER_HOUR, perChatPerHour: env().BOT_TURNS_PER_CHAT_HOUR },
    accessGate:
      env().INVITE_ONLY === "0"
        ? undefined
        : accessGate(defaultAccessStore(), env().NEXT_PUBLIC_SITE_URL, async (chatId) => (await store.chatMembers(chatId)).map((m) => m.id)),
    botNames: botNames(),
    onCardPosted: (betId, providerMessageId) => betStore.setCardMessageId(betId, providerMessageId),
    senderHasOpenBet: (chatId, userId) => awaitsProof(betStore, chatId, userId),
    log: (line, extra) => console.info(`[inbound:${transportName}] ${line}`, extra ?? ""),
  });
  // Vision judging only when asked for; confirm mode still runs the job so referee bets move to "judging".
  const judge = model && env().JUDGE_MODE === "vision" ? modelJudge(model) : undefined;
  const jobRunners: Wiring["jobRunners"] = {
    judge: (payload: Record<string, unknown>) => runJudgeJob({ betStore, proofStore, media, engine, judge, renderVideo: renderVideoFrames }, payload as { betId: string; proofId: string; pass: 1 | 2 }),
  };
  const wiring = { store, betStore, proofStore, media, outbox, engine, pipeline, jobRunners };
  wirings.set(transportName, wiring);
  return wiring;
}

export function isTransportEnabled(name: TransportName): boolean {
  return env().TRANSPORT === name || env().NODE_ENV !== "production";
}
