import Anthropic from "@anthropic-ai/sdk";
import type { TurnContext } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { contextBlock, snapshot } from "./context";
import { systemPrompt } from "./prompts/system";
import { buildTools, type ToolDeps } from "./tools";

export interface RunTurnDeps extends ToolDeps {
  client: Anthropic;
  botName: string;
}

const MAX_ITERATIONS = 4;

/**
 * One agent turn: snapshot the chat, hand Claude the tools, collect whatever
 * the tools posted (cards) plus Claude's closing line. Empty text = silence.
 */
export async function runAgentTurn(ctx: TurnContext, deps: RunTurnDeps): Promise<OutboundMessage[]> {
  const snap = await snapshot(ctx, deps.store, deps.betStore, deps.ledger, deps.clock?.());
  const session = { ctx, snap, replies: [] as OutboundMessage[] };
  const tools = buildTools(deps, session);

  const runner = deps.client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: { effort: "medium" },
    max_iterations: MAX_ITERATIONS,
    system: [{ type: "text", text: systemPrompt(deps.botName), cache_control: { type: "ephemeral" } }],
    tools,
    messages: [
      {
        role: "user",
        content: `<state>\n${contextBlock(snap)}\n</state>\n<message from="${snap.sender.displayName ?? snap.sender.phone}">\n${ctx.event.text}\n</message>`,
      },
    ],
  });

  const final = await runner;
  const text = final.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (final.stop_reason === "refusal") return session.replies;
  if (text) session.replies.push({ text });
  return session.replies;
}
