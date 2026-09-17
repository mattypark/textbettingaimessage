import type { z } from "zod";

/**
 * The one seam between the bot and an LLM vendor. Three call sites use it:
 * the agent turn (tool loop), the follow-up classifier and the vision
 * judge (both structured output). Swap vendors by setting a key; nothing
 * above this file knows which SDK is underneath.
 */
export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  /** Validated input in, a string the model reads back out. */
  run: (input: z.infer<S>) => Promise<string>;
}

/** Type helper so tools keep their input types without naming the schema twice. */
export function tool<S extends z.ZodType>(definition: AgentTool<S>): AgentTool<S> {
  return definition;
}

export type ModelTier = "big" | "small";
export type Effort = "low" | "medium" | "high";

export interface ImagePart {
  mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
}

export interface AgentTurnParams {
  system: string;
  user: string;
  tools: AgentTool[];
  maxIterations: number;
  effort?: Effort;
}

export interface AgentTurnResult {
  /** Closing text after the last tool call; empty means silence. */
  text: string;
  refused: boolean;
  model: string;
}

export interface StructuredParams<T> {
  tier: ModelTier;
  system: string;
  text: string;
  images?: ImagePart[];
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  parsed: T | null;
  refused: boolean;
  model: string;
}

export interface ModelProvider {
  readonly name: "anthropic" | "openai";
  agentTurn(params: AgentTurnParams): Promise<AgentTurnResult>;
  structured<T>(params: StructuredParams<T>): Promise<StructuredResult<T>>;
}
