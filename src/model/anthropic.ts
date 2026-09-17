import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AgentTurnParams, AgentTurnResult, ModelProvider, StructuredParams, StructuredResult } from "./types";

const MODELS = { big: "claude-opus-5", small: "claude-sonnet-5" } as const;

/** Claude: the beta tool runner for turns, messages.parse for structured output. */
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly client: Anthropic) {}

  async agentTurn({ system, user, tools, maxIterations, effort = "medium" }: AgentTurnParams): Promise<AgentTurnResult> {
    const runner = this.client.beta.messages.toolRunner({
      model: MODELS.big,
      max_tokens: 2048,
      output_config: { effort },
      max_iterations: maxIterations,
      // Stable prefix first so it caches across every turn.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.inputSchema, run: (input) => t.run(input) })),
      messages: [{ role: "user", content: user }],
    });
    const final = await runner;
    const text = final.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return { text, refused: final.stop_reason === "refusal", model: MODELS.big };
  }

  async structured<T>({ tier, system, text, images = [], schema, effort = "medium", maxTokens = 1024 }: StructuredParams<T>): Promise<StructuredResult<T>> {
    const model = MODELS[tier];
    const response = await this.client.messages.parse({
      model,
      max_tokens: maxTokens,
      output_config: { effort, format: zodOutputFormat(schema) },
      system,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mime, data: img.base64 } })),
            { type: "text" as const, text },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return { parsed: null, refused: true, model };
    return { parsed: (response.parsed_output as T | null) ?? null, refused: false, model };
  }
}
