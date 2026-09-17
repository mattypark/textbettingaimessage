import type { TurnContext } from "@/src/inbound/pipeline";
import type { ModelProvider } from "@/src/model/types";
import type { OutboundMessage } from "@/src/transport/types";
import { contextBlock, snapshot } from "./context";
import { systemPrompt } from "./prompts/system";
import { buildTools, type ToolDeps } from "./tools";

export interface RunTurnDeps extends ToolDeps {
  model: ModelProvider;
  botName: string;
}

const MAX_ITERATIONS = 4;

/**
 * One agent turn: snapshot the chat, hand the model the tools, collect
 * whatever the tools posted (cards) plus the model's closing line. Empty
 * text = silence.
 */
export async function runAgentTurn(ctx: TurnContext, deps: RunTurnDeps): Promise<OutboundMessage[]> {
  const snap = await snapshot(ctx, deps.store, deps.betStore, deps.ledger, deps.clock?.());
  const session = { ctx, snap, replies: [] as OutboundMessage[] };
  const tools = buildTools(deps, session);

  const result = await deps.model.agentTurn({
    system: systemPrompt(deps.botName),
    user: `<state>\n${contextBlock(snap)}\n</state>\n<message from="${snap.sender.displayName ?? snap.sender.phone}">\n${ctx.event.text}\n</message>`,
    tools,
    maxIterations: MAX_ITERATIONS,
    effort: "medium",
  });

  if (result.refused) return session.replies;
  if (result.text) session.replies.push({ text: result.text });
  return session.replies;
}
