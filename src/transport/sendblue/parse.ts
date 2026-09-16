import { classifyReactionEmoji, type InboundEvent } from "../types";

/**
 * Sendblue inbound webhook body (docs.sendblue.com/getting-started/webhooks).
 * Group fields are empty/null for 1:1 messages.
 */
export interface SendblueWebhook {
  accountEmail?: string;
  content?: string;
  is_outbound?: boolean;
  status?: string;
  message_handle?: string;
  date_sent?: string;
  date_updated?: string;
  from_number?: string;
  number?: string;
  to_number?: string;
  was_downgraded?: boolean;
  media_url?: string;
  media_urls?: string[];
  message_type?: string;
  group_id?: string | null;
  participants?: string[];
  group_display_name?: string | null;
  service?: string;
  reply_to?: string | null;
}

/**
 * On SMS/RCS fallback (and some iMessage paths) a tapback arrives as plain
 * text: `Liked "the original message"`. There is no target id in that form,
 * so the pipeline resolves it against the most recent bot card in the chat.
 */
export const TEXT_REACTION = /^(Liked|Loved|Disliked|Laughed at|Emphasized|Questioned)\s+[“"](.+)[”"]$/su;

export function textReactionKind(verb: string): "affirm" | "decline" | "other" {
  if (verb === "Liked" || verb === "Loved") return "affirm";
  if (verb === "Disliked") return "decline";
  return "other";
}

/** Sendblue sends either the legacy singular field or the array. Merge both. */
export function mediaUrls(body: SendblueWebhook): string[] {
  const urls = new Set<string>();
  if (body.media_url) urls.add(body.media_url);
  for (const url of body.media_urls ?? []) if (url) urls.add(url);
  return [...urls];
}

function mimeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
  };
  return map[ext] ?? "application/octet-stream";
}

export function normalizeSendblue(body: SendblueWebhook): InboundEvent | null {
  if (body.is_outbound) return null;
  if (!body.message_handle || !body.from_number) return null;

  const isGroup = Boolean(body.group_id);
  // Replies must target the group, never the sender — replying to
  // `from_number` silently turns a group question into a DM.
  const providerChatId = body.group_id || body.from_number;
  const text = (body.content ?? "").trim();

  const base: InboundEvent = {
    provider: "sendblue",
    providerEventId: body.message_handle,
    providerMessageId: body.message_handle,
    providerChatId,
    isGroup,
    senderHandle: body.from_number,
    participants: body.participants,
    text,
    attachments: mediaUrls(body).map((url) => ({ url, mime: mimeFromUrl(url) })),
    replyToProviderMessageId: body.reply_to ?? undefined,
    receivedAt: body.date_sent ?? new Date().toISOString(),
    raw: body,
  };

  if (body.message_type === "reaction") {
    const emojiMatch = text.match(/\p{Extended_Pictographic}/u)?.[0];
    return {
      ...base,
      text: "",
      reaction: {
        targetProviderMessageId: body.reply_to ?? "",
        kind: classifyReactionEmoji(emojiMatch),
        emoji: emojiMatch,
        removed: false,
      },
    };
  }

  const textReaction = text.match(TEXT_REACTION);
  if (textReaction) {
    return {
      ...base,
      text: "",
      reaction: {
        targetProviderMessageId: "",
        kind: textReactionKind(textReaction[1]),
        removed: false,
      },
    };
  }

  if (!text && base.attachments.length === 0) return null;
  return base;
}
