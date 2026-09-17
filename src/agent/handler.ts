import type { ModelProvider } from "@/src/model/types";
import { commandHandler } from "@/src/bets/commands";
import type { TurnContext, TurnHandler } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { displayName } from "./context";
import { TermsGate } from "@/src/onboarding/gate";
import { TERMS_VERSION } from "@/src/onboarding/terms";
import type { Classifier } from "./classifier";
import { runAgentTurn, type RunTurnDeps } from "./run-turn";
import { intakeProof, type IntakeDeps } from "@/src/proof/intake";

export interface AgentHandlerDeps extends Omit<RunTurnDeps, "model"> {
  model?: ModelProvider;
  classifier?: Classifier;
  /** Test seam: replaces the Claude call. */
  runTurn?: (ctx: TurnContext) => Promise<OutboundMessage[]>;
  /** Proof intake; absent = attachments are ignored. */
  intake?: Omit<IntakeDeps, "betStore" | "engine">;
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
    mayStake: (userId) => deps.store.hasAcceptedTerms(userId, TERMS_VERSION),
    needsTermsMessage: (name) => new TermsGate(deps.store, deps.siteUrl).needsTermsMessage(name),
    setPayHandle: (userId, provider, handle) => deps.store.setPayHandle(userId, provider, handle),
  });

  const gate = new TermsGate(deps.store, deps.siteUrl);

  return async (ctx) => {
    const { event, decision } = ctx;
    const name = displayName({ displayName: null, phone: event.senderHandle });

    if (await gate.tryAcceptFrom(event, ctx.chatId, ctx.userId)) {
      return event.reaction ? [] : [{ text: `👍 got you, ${name}. you're in.` }];
    }
    if (event.reaction || /^!\w+/.test(event.text.trim()) || decision.reason === "command") return commands(ctx);

    if (event.participantAdded && !event.text) return [];

    if (ctx.attachments.length && deps.intake) {
      const betRef = event.text.match(/#?([0-9a-f]{6})\b/i)?.[1];
      const proofReplies = await intakeProof(
        { ...deps.intake, betStore: deps.betStore, engine: deps.engine },
        event,
        ctx.attachments,
        ctx.chatId,
        ctx.userId,
        betRef ? (await deps.betStore.openBetsInChat(ctx.chatId)).find((b) => b.id.startsWith(betRef))?.id : undefined
      );
      if (proofReplies.length || decision.reason === "proof_attachment") return proofReplies;
    }

    if (decision.act === "maybe") {
      const addressed = deps.classifier ? await deps.classifier(event.text, deps.botName) : false;
      if (!addressed) return [];
    }

    if (!(await gate.accepted(ctx.userId)) && /\b(bet|says|wager|i'?m in|deal)\b/i.test(event.text)) {
      return [{ text: gate.needsTermsMessage(name) }];
    }

    if (deps.runTurn) return deps.runTurn(ctx);
    if (!deps.model) return [{ text: `${displayName({ displayName: null, phone: event.senderHandle })}: agent is not configured (set OPENAI_API_KEY or ANTHROPIC_API_KEY)` }];
    return runAgentTurn(ctx, { ...deps, model: deps.model });
  };
}
