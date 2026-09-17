import { z } from "zod";
import type { AgentTool, AgentTurnParams, AgentTurnResult, ModelProvider, StructuredParams, StructuredResult } from "./types";

/**
 * The slice of the OpenAI SDK this file uses, typed loosely so tests can
 * hand in a fake and so an SDK bump does not ripple through the bot.
 */
export interface ChatClient {
  chat: { completions: { create(params: Record<string, unknown>): Promise<ChatResponse> } };
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface AssistantMessage {
  role: "assistant";
  content: string | null;
  refusal?: string | null;
  tool_calls?: ToolCall[];
}

export interface ChatResponse {
  model?: string;
  choices: Array<{ message: AssistantMessage; finish_reason?: string }>;
}

export interface OpenAIModels {
  big: string;
  small: string;
}

/** gpt-5 family and o-series take reasoning_effort; older chat models reject it. */
const REASONING_MODEL = /^(gpt-5|o\d)/;

function jsonSchema(schema: z.ZodType, io: "input" | "output"): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

/** OpenAI Chat Completions: function tools for the turn loop, json_schema for structured output, data-URL images for vision. */
export class OpenAIProvider implements ModelProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly client: ChatClient,
    private readonly models: OpenAIModels,
    /** Debug tap: every tool call and result, and the final stop. */
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  private base(model: string, effort: string | undefined) {
    return REASONING_MODEL.test(model) && effort ? { model, reasoning_effort: effort } : { model };
  }

  /** Reasoning models spend hidden tokens before answering; a tight cap yields finish_reason "length" and no text. */
  private budget(model: string, wanted: number) {
    return REASONING_MODEL.test(model) ? Math.max(wanted, 8000) : wanted;
  }

  async agentTurn({ system, user, tools, maxIterations, effort = "medium" }: AgentTurnParams): Promise<AgentTurnResult> {
    const model = this.models.big;
    const byName = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const toolDefs = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: jsonSchema(t.inputSchema, "input") },
    }));

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.chat.completions.create({
        ...this.base(model, effort),
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        max_completion_tokens: this.budget(model, 2048),
      });
      const message = response.choices[0]?.message;
      if (!message) return { text: "", refused: false, model };
      if (message.refusal) return { text: "", refused: true, model };
      messages.push(message as unknown as Record<string, unknown>);
      if (!message.tool_calls?.length) {
        this.log(`final (${response.choices[0]?.finish_reason ?? "?"}): ${JSON.stringify(message.content ?? "")}`);
        return { text: (message.content ?? "").trim(), refused: false, model };
      }

      for (const call of message.tool_calls) {
        const result = await runTool(byName.get(call.function.name), call.function.arguments);
        this.log(`tool ${call.function.name}(${call.function.arguments.slice(0, 300)}) → ${result.slice(0, 300)}`);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    this.log(`stopped after ${maxIterations} iterations with no final text`);
    return { text: "", refused: false, model };
  }

  async structured<T>({ tier, system, text, images = [], schema, effort = "medium", maxTokens = 1024 }: StructuredParams<T>): Promise<StructuredResult<T>> {
    const model = this.models[tier];
    const response = await this.client.chat.completions.create({
      ...this.base(model, effort),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}`, detail: "high" } })),
            { type: "text", text },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "output", schema: jsonSchema(schema, "output") } },
      max_completion_tokens: this.budget(model, maxTokens),
    });
    const message = response.choices[0]?.message;
    if (!message || message.refusal) return { parsed: null, refused: Boolean(message?.refusal), model };
    try {
      const parsed = schema.safeParse(JSON.parse(message.content ?? ""));
      return { parsed: parsed.success ? parsed.data : null, refused: false, model };
    } catch {
      return { parsed: null, refused: false, model };
    }
  }
}

async function runTool(tool: AgentTool | undefined, rawArguments: string): Promise<string> {
  if (!tool) return `error: unknown tool`;
  let raw: unknown;
  try {
    raw = JSON.parse(rawArguments || "{}");
  } catch {
    return "error: arguments were not valid JSON";
  }
  const parsed = tool.inputSchema.safeParse(raw);
  if (!parsed.success) return `error: invalid input — ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  try {
    return await tool.run(parsed.data);
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
  }
}
