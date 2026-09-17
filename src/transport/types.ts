/**
 * Provider-agnostic messaging contract.
 *
 * Every iMessage provider (Linq, Sendblue, the in-memory fake) is adapted to
 * this interface so nothing above the transport layer knows which vendor is
 * live. If Apple changes the economics of Mac-relay providers, the migration
 * is one adapter, not a rewrite.
 */

export type TransportName = "linq" | "sendblue" | "fake";

export interface InboundAttachmentRef {
  /** Provider URL. Presigned and short-lived (Linq: 15 min) — download immediately. */
  url: string;
  mime: string;
  filename?: string;
  bytes?: number;
  providerAttachmentId?: string;
}

export type ReactionKind = "affirm" | "decline" | "other";

export interface InboundReaction {
  /** Provider id of the message that was reacted to. */
  targetProviderMessageId: string;
  kind: ReactionKind;
  emoji?: string;
  /** True when the reaction was removed rather than added. */
  removed: boolean;
}

/**
 * A normalized inbound event. Exactly one of `text`, `attachments`,
 * `reaction`, or `participantAdded` carries the payload; the rest may be
 * empty. `providerMessageId` is the idempotency key for the whole pipeline.
 */
export interface InboundEvent {
  provider: TransportName;
  providerEventId: string;
  providerMessageId: string;
  providerChatId: string;
  isGroup: boolean;
  senderHandle: string;
  /** Every handle in the chat when the provider tells us (Sendblue does, Linq on chat.created). */
  participants?: string[];
  text: string;
  attachments: InboundAttachmentRef[];
  reaction?: InboundReaction;
  replyToProviderMessageId?: string;
  /** Set on membership events: the handle that joined. */
  participantAdded?: string;
  receivedAt: string;
  /** Raw provider payload, persisted for replay and debugging. */
  raw: unknown;
}

export type OutboundAttachment =
  | { url: string; mime: string }
  /** The bot's own vCard; each transport decides how (Linq uploads it once). */
  | { contactCard: true };

export interface OutboundMessage {
  text: string;
  /** Sent as a rich link preview on providers that support it (Linq: the link is the whole message). */
  link?: string;
  /** Optional card layout for providers that can render an iMessage app card for the link. */
  card?: { caption: string; subcaption?: string; trailing?: string; imageUrl?: string };
  attachments?: OutboundAttachment[];
  replyToProviderMessageId?: string;
  effect?: "confetti";
  /** Dedupe key forwarded to the provider when it supports one. */
  idempotencyKey?: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface VerifyInput {
  rawBody: string;
  headers: Record<string, string>;
}

export interface MessageTransport {
  readonly name: TransportName;
  /** Signature/secret check. Must be constant-time and never throw on bad input. */
  verify(input: VerifyInput): boolean;
  /** Provider payload → normalized event. `null` means "not something we act on". */
  parseInbound(rawBody: string): InboundEvent | null;
  send(providerChatId: string, message: OutboundMessage): Promise<SendResult>;
  typing(providerChatId: string, on: boolean): Promise<void>;
  /** Best-effort; providers without a reactions API resolve silently. */
  react(providerMessageId: string, emoji: string): Promise<void>;
}

/** Tapback → intent map shared by every adapter. */
export const AFFIRM_EMOJI = /❤️|❤|👍|✔|✅|🔥|💯/u;
export const DECLINE_EMOJI = /👎|❌|❎|🚫/u;

export function classifyReactionEmoji(emoji: string | undefined): ReactionKind {
  if (!emoji) return "other";
  if (AFFIRM_EMOJI.test(emoji)) return "affirm";
  if (DECLINE_EMOJI.test(emoji)) return "decline";
  return "other";
}
