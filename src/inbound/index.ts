import { botNames, env } from "@/src/config/env";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/src/db/admin";
import { MemoryStore } from "@/src/db/memory-store";
import type { Store } from "@/src/db/store";
import { SupabaseStore } from "@/src/db/supabase-store";
import { createTransport } from "@/src/transport";
import type { TransportName } from "@/src/transport/types";
import { echoHandler } from "./echo-handler";
import { InboundPipeline } from "./pipeline";

let memoryStore: MemoryStore | undefined;

/** Supabase when configured; an in-process MemoryStore otherwise (dev without a DB). */
export function defaultStore(): Store {
  if (isSupabaseAdminConfigured()) return new SupabaseStore(supabaseAdmin());
  memoryStore ??= new MemoryStore();
  return memoryStore;
}

export function pipelineFor(transportName: TransportName): InboundPipeline {
  return new InboundPipeline({
    store: defaultStore(),
    transport: createTransport(transportName),
    handler: echoHandler,
    botNames: botNames(),
    log: (line, extra) => console.info(`[inbound:${transportName}] ${line}`, extra ?? ""),
  });
}

export function isTransportEnabled(name: TransportName): boolean {
  return env().TRANSPORT === name || env().NODE_ENV !== "production";
}
