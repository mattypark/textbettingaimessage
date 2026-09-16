import type Anthropic from "@anthropic-ai/sdk";
import { commandHandler } from "@/src/bets/commands";
import type { TurnContext, TurnHandler } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { displayName } from "./context";
import type { Classifier } from "./classifier";
import { runAgentTurn, type RunTurnDeps } from "./run-turn";

export interface AgentHandlerDeps extends Omit<RunTurnDeps, "client"> {
  client?: Anthropic;
  classifier?: Classifier;
  /** Test seam: replaces the Claude call. */
  runTurn?: (ctx: TurnContext) => Promise<OutboundMessage[]>;
}

/**
 * Routes a gated inbound event: reactions and `!commands` go to the
 * deterministic command layer; "maybe" text is screened by the classifier;
 * everything else runs a Claude turn.
 */
export function agentHandler(deps: AgentHandlerDeps): TurnHandler {
  const commands = commandHandler({
    store: deps.betStore,
    engine: deps.engine,
    names: (id) => id,
    clock: deps.clock,
  });

  return async (ctx) => {
    const { event, decision } = ctx;
    if (event.reaction || /^!\w+/.test(event.text.trim())) return commands(ctx);

    if (event.participantAdded && !event.text) return [];

    if (decision.act === "maybe") {
      const addressed = deps.classifier ? await deps.classifier(event.text, deps.botName) : false;
      if (!addressed) return [];
    }

    if (deps.runTurn) return deps.runTurn(ctx);
    if (!deps.client) return [{ text: `${displayName({ displayName: null, phone: event.senderHandle })}: agent is not configured (ANTHROPIC_API_KEY)` }];
    return runAgentTurn(ctx, { ...deps, client: deps.client });
  };
}
