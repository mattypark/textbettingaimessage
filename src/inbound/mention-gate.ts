import type { InboundEvent } from "@/src/transport/types";

/** Stake-shaped language that is worth a second look even without a name. */
export const STAKE_GRAMMAR = /\$\s?\d+|\bbet\b|\bsays\b|loser buys|\bi'?ll bet\b|\bdispute\b|\bwager\b|\bodds\b/i;

export interface GateInput {
  event: InboundEvent;
  botNames: string[];
  /** Provider ids of messages the bot sent into this chat (newest first). */
  recentBotMessageIds: string[];
  /** True when a bet in this chat is waiting on this sender's proof. */
  senderHasOpenBet: boolean;
}

export type GateDecision =
  | { act: true; reason: "dm" | "named" | "command" | "reply_to_bot" | "reaction_on_bot" | "proof_attachment" | "membership" }
  | { act: "maybe"; reason: "stake_grammar" }
  | { act: false; reason: "silent" };

/**
 * Decides whether a group message is for the bot. Pure; the LLM classifier
 * only runs for the "maybe" branch so most chatter never costs a token.
 */
export function gate({ event, botNames, recentBotMessageIds, senderHasOpenBet }: GateInput): GateDecision {
  if (event.participantAdded) return { act: true, reason: "membership" };
  if (!event.isGroup) return { act: true, reason: "dm" };
  if (/^!\w+/.test(event.text.trim())) return { act: true, reason: "command" };

  if (event.reaction) {
    return recentBotMessageIds.includes(event.reaction.targetProviderMessageId) ||
      event.reaction.targetProviderMessageId === ""
      ? { act: true, reason: "reaction_on_bot" }
      : { act: false, reason: "silent" };
  }

  if (event.replyToProviderMessageId && recentBotMessageIds.includes(event.replyToProviderMessageId)) {
    return { act: true, reason: "reply_to_bot" };
  }

  const lower = event.text.toLowerCase();
  if (botNames.some((name) => name && (lower.includes(name) || lower.includes(`@${name}`)))) {
    return { act: true, reason: "named" };
  }

  if (event.attachments.length > 0 && senderHasOpenBet) {
    return { act: true, reason: "proof_attachment" };
  }

  if (STAKE_GRAMMAR.test(event.text)) return { act: "maybe", reason: "stake_grammar" };

  return { act: false, reason: "silent" };
}
