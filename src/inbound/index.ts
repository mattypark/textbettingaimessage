import Anthropic from "@anthropic-ai/sdk";
import { accessGate } from "@/src/access/gate";
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from "@/src/access/rate-limit";
import { MemoryAccessStore, SupabaseAccessStore, type AccessStore } from "@/src/access/store";
import { agentHandler } from "@/src/agent/handler";
import { claudeClassifier } from "@/src/agent/classifier";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore, type BetStore } from "@/src/bets/store";
import { SupabaseBetStore } from "@/src/bets/supabase-store";
import { botNames, env } from "@/src/config/env";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/src/db/admin";
import { MemoryStore } from "@/src/db/memory-store";
import type { Store } from "@/src/db/store";
import { SupabaseStore } from "@/src/db/supabase-store";
import { createLedger } from "@/src/ledger";
import { awaitsProof } from "@/src/proof/intake";
import { claudeJudge } from "@/src/proof/judge";
import { MemoryMediaStore, SupabaseMediaStore, type MediaStore } from "@/src/proof/media-store";
import { renderVideoFrames } from "@/src/proof/frames";
import { runJudgeJob } from "@/src/proof/run-judge";
import { MemoryProofStore, SupabaseProofStore, type ProofStore } from "@/src/proof/store";
import { introMessage } from "@/src/onboarding/terms";
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
  return { store: w.store, betStore: w.betStore, engine: w.engine, outbox: w.outbox, pipeline: w.pipeline, proofStore: w.proofStore, jobRunners: w.jobRunners, promote: () => defaultAccessStore().promote(3) };
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
    log: (line, extra) => console.info(`[engine] ${line}`, extra ?? ""),
  });
  const ledger = createLedger();
  const client = env().ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env().ANTHROPIC_API_KEY }) : undefined;
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
      client,
      classifier: client ? claudeClassifier(client) : undefined,
      intake: { proofStore, media },
    }),
    media,
    introMessage: () => ({ text: introMessage(botName, env().NEXT_PUBLIC_SITE_URL) }),
    accessGate: env().INVITE_ONLY === "0" ? undefined : accessGate(defaultAccessStore(), env().NEXT_PUBLIC_SITE_URL),
    botNames: botNames(),
    onCardPosted: (betId, providerMessageId) => betStore.setCardMessageId(betId, providerMessageId),
    senderHasOpenBet: (chatId, userId) => awaitsProof(betStore, chatId, userId),
    log: (line, extra) => console.info(`[inbound:${transportName}] ${line}`, extra ?? ""),
  });
  const judge = client ? claudeJudge(client) : undefined;
  const jobRunners: Wiring["jobRunners"] = judge
    ? { judge: (payload: Record<string, unknown>) => runJudgeJob({ betStore, proofStore, media, engine, judge, renderVideo: renderVideoFrames }, payload as { betId: string; proofId: string; pass: 1 | 2 }) }
    : {};
  const wiring = { store, betStore, proofStore, media, outbox, engine, pipeline, jobRunners };
  wirings.set(transportName, wiring);
  return wiring;
}

export function isTransportEnabled(name: TransportName): boolean {
  return env().TRANSPORT === name || env().NODE_ENV !== "production";
}
