import Anthropic from "@anthropic-ai/sdk";
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
import { introMessage } from "@/src/onboarding/terms";
import { createTransport } from "@/src/transport";
import { Outbox } from "@/src/transport/outbox";
import type { TransportName } from "@/src/transport/types";
import { InboundPipeline } from "./pipeline";

let memoryStore: MemoryStore | undefined;
let memoryBetStore: MemoryBetStore | undefined;

/** Supabase when configured; in-process memory stores otherwise (dev without a DB). */
export function defaultStore(): Store {
  if (isSupabaseAdminConfigured()) return new SupabaseStore(supabaseAdmin());
  memoryStore ??= new MemoryStore();
  return memoryStore;
}

export function defaultBetStore(): BetStore {
  if (isSupabaseAdminConfigured()) return new SupabaseBetStore(supabaseAdmin());
  memoryBetStore ??= new MemoryBetStore();
  return memoryBetStore;
}

const names = (userId: string) => userId.slice(0, 8);

interface Wiring {
  store: Store;
  betStore: BetStore;
  outbox: Outbox;
  engine: BetEngine;
  pipeline: InboundPipeline;
}

const wirings = new Map<TransportName, Wiring>();

export function tickDeps() {
  const w = wire(env().TRANSPORT);
  return { store: w.store, betStore: w.betStore, engine: w.engine, outbox: w.outbox, pipeline: w.pipeline };
}

export function pipelineFor(transportName: TransportName): InboundPipeline {
  return wire(transportName).pipeline;
}

function wire(transportName: TransportName): Wiring {
  const existing = wirings.get(transportName);
  if (existing) return existing;
  const store = defaultStore();
  const betStore = defaultBetStore();
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
  const botName = botNames()[0] ?? "bookie";
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
    }),
    introMessage: () => ({ text: introMessage(botName, env().NEXT_PUBLIC_SITE_URL) }),
    botNames: botNames(),
    onCardPosted: (betId, providerMessageId) => betStore.setCardMessageId(betId, providerMessageId),
    senderHasOpenBet: async (chatId, userId) =>
      (await betStore.openBetsInChat(chatId)).some((b) => b.status === "locked" && b.participants.some((p) => p.userId === userId)),
    log: (line, extra) => console.info(`[inbound:${transportName}] ${line}`, extra ?? ""),
  });
  const wiring = { store, betStore, outbox, engine, pipeline };
  wirings.set(transportName, wiring);
  return wiring;
}

export function isTransportEnabled(name: TransportName): boolean {
  return env().TRANSPORT === name || env().NODE_ENV !== "production";
}
