import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "@/src/config/env";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider, type ChatClient, type ChatResponse } from "./openai";
import type { ModelProvider } from "./types";

export type { AgentTool, ModelProvider } from "./types";
export { tool } from "./types";

let cached: ModelProvider | null | undefined;

/**
 * Picks the vendor from the environment: MODEL_PROVIDER wins, else whichever
 * key is set (OpenAI first). Undefined = no LLM; the bot still runs its
 * deterministic paths (!bet, 👍, !cancel, !pay, !balance).
 */
export function createModel(): ModelProvider | undefined {
  if (cached !== undefined) return cached ?? undefined;
  const e = env();
  const want = e.MODEL_PROVIDER ?? (e.OPENAI_API_KEY ? "openai" : e.ANTHROPIC_API_KEY ? "anthropic" : undefined);
  if (want === "openai" && e.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: e.OPENAI_API_KEY });
    // The provider types the request loosely; the SDK's overloads want the exact param union.
    const client: ChatClient = {
      chat: { completions: { create: (params) => openai.chat.completions.create(params as never) as unknown as Promise<ChatResponse> } },
    };
    const log = process.env.MODEL_DEBUG === "1" ? (line: string) => console.info(`[model] ${line}`) : undefined;
    cached = new OpenAIProvider(client, { big: e.OPENAI_MODEL, small: e.OPENAI_MODEL_SMALL }, log);
  } else if (want === "anthropic" && e.ANTHROPIC_API_KEY) {
    cached = new AnthropicProvider(new Anthropic({ apiKey: e.ANTHROPIC_API_KEY }));
  } else {
    cached = null;
  }
  return cached ?? undefined;
}

/** Test hook. */
export function resetModelCache(): void {
  cached = undefined;
}
