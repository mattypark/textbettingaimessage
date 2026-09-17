import type { ModelProvider } from "@/src/model/types";
import { inviteLine } from "@/src/access/invite-line";
import { commandHandler } from "@/src/bets/commands";
import { draftFlow } from "@/src/bets/draft-flow";
import { namesFor } from "@/src/db/names";
import type { TurnContext, TurnHandler } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { displayName } from "./context";
import { TermsGate } from "@/src/onboarding/gate";
import { TERMS_VERSION } from "@/src/onboarding/terms";
import type { Classifier } from "./classifier";
import { runAgentTurn, type RunTurnDeps } from "./run-turn";
import { templateReply, worthClassifying } from "./templates";
import { intakeProof, type IntakeDeps } from "@/src/proof/intake";

export interface AgentHandlerDeps extends Omit<RunTurnDeps, "model"> {
  model?: ModelProvider;
  /** "off": never call the model; the scripted builder and commands do everything. */
  modelMode?: "assist" | "off";
  /** "confirm": the opponent calls the result; no challenge word in proof. */
  judgeMode?: "confirm" | "vision";
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
    namesFor: namesFor(deps.store),
    clock: deps.clock,
    mayStake: (userId) => deps.store.hasAcceptedTerms(userId, TERMS_VERSION),
    needsTermsMessage: (name, chatId) => new TermsGate(deps.store, deps.siteUrl).needsTermsMessage(name, chatId),
    setPayHandle: (userId, provider, handle) => deps.store.setPayHandle(userId, provider, handle),
    inviteLink: deps.access ? async (userId) => inviteLine(await deps.access!.ensureInvite(userId), deps.siteUrl) : undefined,
    members: async (chatId) => (await deps.store.chatMembers(chatId)).map((m) => m.id),
    challengeToken: deps.judgeMode !== "confirm",
    setName: (userId, name) => deps.store.setDisplayName(userId, name),
  });

  const gate = new TermsGate(deps.store, deps.siteUrl);
  const drafts = draftFlow({
    store: deps.store,
    betStore: deps.betStore,
    namesFor: namesFor(deps.store),
    botName: deps.botName,
    clock: deps.clock,
    mayStake: (userId) => deps.store.hasAcceptedTerms(userId, TERMS_VERSION),
    needsTermsMessage: (name, chatId) => gate.needsTermsMessage(name, chatId),
    challengeToken: deps.judgeMode !== "confirm",
    modelMode: deps.modelMode,
  });

  return async (ctx) => {
    const { event, decision } = ctx;
    const name = displayName({ displayName: null, phone: event.senderHandle });

    if (await gate.tryAcceptFrom(event, ctx.chatId, ctx.userId)) {
      // A 👍 from each person would otherwise ask each of them their name; stay quiet there.
      // Names come from the sign sheet, or from "call me matt".
      const resumed = await drafts.resume(ctx);
      if (event.reaction) return resumed ?? [];
      const known = (await deps.store.chatMembers(ctx.chatId)).find((m) => m.id === ctx.userId)?.displayName;
      const hello = known ? `bet, you're in ${known}` : `bet, you're in — what should i call you? ("call me matt")`;
      return resumed ? [{ text: hello }, ...resumed] : [{ text: hello }];
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

    // Free replies first: a bare "hey mushy", help, thanks, then plain-English
    // twins of the commands (leaderboard, balance, invite). No tokens, no wait.
    const canned = templateReply(ctx, deps.botName);
    if (canned) {
      if (canned.kind === "wake") await drafts.open(ctx);
      return canned.messages;
    }
    const viaCommand = await commands(ctx);
    if (viaCommand.length) return viaCommand;
    const drafted = await drafts.step(ctx);
    if (drafted) return drafted;

    if (decision.act === "maybe") {
      if (!worthClassifying(event.text)) return [];
      const addressed = deps.classifier ? await deps.classifier(event.text, deps.botName) : false;
      if (!addressed) return [];
    }

    if (!(await gate.accepted(ctx.userId)) && /\b(bet|says|wager|i'?m in|deal)\b/i.test(event.text)) {
      return [{ text: gate.needsTermsMessage(name, ctx.chatId) }];
    }

    if (deps.modelMode === "off") {
      // Scripted only: anything we couldn't match gets nudged into the builder.
      await drafts.open(ctx);
      return [{ text: `say the bet in one line and i'll take it from there — or "!bet thing ; 20 ; friday"` }];
    }
    if (deps.runTurn) return deps.runTurn(ctx);
    if (!deps.model) return [{ text: `my brain's not plugged in yet (no model key). "!bet thing ; 20 ; friday" still works` }];
    return runAgentTurn(ctx, { ...deps, model: deps.model });
  };
}
