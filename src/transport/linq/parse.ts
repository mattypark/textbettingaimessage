import type { LinqAPIV3 } from "@linqapp/sdk";
import {
  classifyReactionEmoji,
  type InboundAttachmentRef,
  type InboundEvent,
  type ReactionKind,
} from "../types";

type AnyEvent = LinqAPIV3.UnwrapWebhookEvent;

/** Linq's named tapbacks, before custom-emoji ones. */
const NAMED_REACTION: Record<string, ReactionKind> = {
  love: "affirm",
  like: "affirm",
  dislike: "decline",
};

export function reactionKind(
  reactionType: string,
  customEmoji: string | null | undefined
): ReactionKind {
  if (reactionType === "custom") return classifyReactionEmoji(customEmoji ?? undefined);
  return NAMED_REACTION[reactionType] ?? "other";
}

/**
 * Normalizes an already-verified Linq webhook event. Unknown or outbound
 * events return `null` so the route can 200 them without doing work.
 */
export function normalizeLinqEvent(event: AnyEvent): InboundEvent | null {
  const type = event.event_type;

  if (type === "message.received") {
    const { data } = event as LinqAPIV3.Webhooks.MessageReceivedWebhookEvent;
    if (data.direction !== "inbound") return null;

    const text = data.parts
      .filter((part): part is LinqAPIV3.Webhooks.SchemasTextPartResponse => part.type === "text")
      .map((part) => part.value)
      .join("\n")
      .trim();

    const attachments: InboundAttachmentRef[] = data.parts
      .filter((part): part is LinqAPIV3.Webhooks.SchemasMediaPartResponse => part.type === "media")
      .map((part) => ({
        url: part.url,
        mime: part.mime_type,
        filename: part.filename,
        bytes: part.size_bytes,
        providerAttachmentId: part.id,
      }));

    if (!text && attachments.length === 0) return null;

    return {
      provider: "linq",
      providerEventId: event.event_id,
      providerMessageId: data.id,
      providerChatId: data.chat.id,
      isGroup: Boolean(data.chat.is_group),
      senderHandle: data.sender_handle.handle,
      text,
      attachments,
      replyToProviderMessageId: data.reply_to?.message_id ?? undefined,
      receivedAt: data.sent_at ?? event.created_at,
      raw: event,
    };
  }

  if (type === "reaction.added" || type === "reaction.removed") {
    const { data } = event as LinqAPIV3.Webhooks.ReactionAddedWebhookEvent;
    if (data.is_from_me) return null;
    const senderHandle = data.from_handle?.handle ?? data.from;
    if (!data.chat_id || !data.message_id || !senderHandle) return null;

    const kind = reactionKind(data.reaction_type, data.custom_emoji);
    return {
      provider: "linq",
      providerEventId: event.event_id,
      // Reactions carry no message id of their own; the event id is unique.
      providerMessageId: `reaction:${event.event_id}`,
      providerChatId: data.chat_id,
      isGroup: true,
      senderHandle,
      text: "",
      attachments: [],
      reaction: {
        targetProviderMessageId: data.message_id,
        kind,
        emoji: data.custom_emoji ?? undefined,
        removed: type === "reaction.removed",
      },
      receivedAt: data.reacted_at ?? event.created_at,
      raw: event,
    };
  }

  if (type === "participant.added") {
    const { data } = event as LinqAPIV3.Webhooks.ParticipantAddedWebhookEvent;
    if (!data.chat_id) return null;
    return {
      provider: "linq",
      providerEventId: event.event_id,
      providerMessageId: `participant:${event.event_id}`,
      providerChatId: data.chat_id,
      isGroup: true,
      senderHandle: data.handle,
      text: "",
      attachments: [],
      participantAdded: data.handle,
      receivedAt: data.added_at ?? event.created_at,
      raw: event,
    };
  }

  if (type === "chat.created") {
    const { data } = event as LinqAPIV3.Webhooks.ChatCreatedWebhookEvent;
    const chat = (data as { chat?: { id: string; is_group: boolean; owner_handle?: { handle: string } } }).chat;
    const participants = (data as { participants?: Array<{ handle: string; is_me?: boolean | null }> }).participants;
    if (!chat) return null;
    const others = (participants ?? []).filter((p) => !p.is_me).map((p) => p.handle);
    return {
      provider: "linq",
      providerEventId: event.event_id,
      providerMessageId: `chat:${event.event_id}`,
      providerChatId: chat.id,
      isGroup: chat.is_group,
      senderHandle: others[0] ?? chat.owner_handle?.handle ?? "",
      participants: others,
      text: "",
      attachments: [],
      participantAdded: chat.owner_handle?.handle,
      receivedAt: event.created_at,
      raw: event,
    };
  }

  return null;
}
