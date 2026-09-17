import type { InboundEvent } from "@/src/transport/types";

/** Stake-shaped language that is worth a second look even without a name. */
export const STAKE_GRAMMAR = /\$\s?\d+|\bbet\b|\bsays\b|loser buys|\bi'?ll bet\b|\bdispute\b|\bwager\b|\bodds\b/i;

/**
 * After the bot speaks in a group it keeps listening this long, Instinct
 * style: "hey mushy …" wakes it, and the replies that follow don't need the
 * name again. Follow-ups go to the classifier, so unrelated chatter still
 * stays silent.
 */
export const ATTENTION_WINDOW_MS = 2 * 60 * 1000;

export interface GateInput {
  event: InboundEvent;
  botNames: string[];
  /** Provider ids of messages the bot sent into this chat (newest first). */
  recentBotMessageIds: string[];
  /** True when a bet in this chat is waiting on this sender's proof. */
  senderHasOpenBet: boolean;
  /** ISO time the bot last sent into this chat, or null if never. */
  lastBotMessageAt?: string | null;
  /** Injectable clock for tests. */
  now?: number;
}

export type GateDecision =
  | { act: true; reason: "dm" | "named" | "command" | "reply_to_bot" | "reaction_on_bot" | "proof_attachment" | "membership" }
  | { act: "maybe"; reason: "stake_grammar" | "attention" }
  | { act: false; reason: "silent" };

/**
 * Decides whether a group message is for the bot. Pure; the LLM classifier
 * only runs for the "maybe" branch so most chatter never costs a token.
 */
export function gate({ event, botNames, recentBotMessageIds, senderHasOpenBet, lastBotMessageAt = null, now = Date.now() }: GateInput): GateDecision {
  if (event.participantAdded) return { act: true, reason: "membership" };
  if (!event.isGroup) return { act: true, reason: "dm" };
  if (/^!\w+/.test(event.text.trim()) || /^call\s+#?[0-9a-f]{6,}\s+(yes|no|stands|fails)\b/i.test(event.text.trim())) {
    return { act: true, reason: "command" };
  }

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

  if (lastBotMessageAt && now - Date.parse(lastBotMessageAt) < ATTENTION_WINDOW_MS && event.text.trim()) {
    return { act: "maybe", reason: "attention" };
  }

  if (STAKE_GRAMMAR.test(event.text)) return { act: "maybe", reason: "stake_grammar" };

  return { act: false, reason: "silent" };
}
