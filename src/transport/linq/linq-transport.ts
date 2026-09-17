import type { LinqAPIV3 } from "@linqapp/sdk";
import { env } from "@/src/config/env";
import { botNames } from "@/src/config/env";
import { linqClient } from "./client";
import { contactCardAttachmentId } from "./contact-card";
import { normalizeLinqEvent } from "./parse";
import type {
  InboundEvent,
  MessageTransport,
  OutboundMessage,
  SendResult,
  VerifyInput,
} from "../types";

/**
 * Linq adapter. Verification uses the SDK's Standard-Webhooks unwrap with the
 * subscription secret; without a secret configured (local `linq webhooks
 * listen --forward-to`) every payload is accepted, which is only acceptable
 * in development.
 */
export class LinqTransport implements MessageTransport {
  readonly name = "linq" as const;

  verify({ rawBody, headers }: VerifyInput): boolean {
    const secret = env().LINQ_WEBHOOK_SECRET;
    if (!secret) return env().NODE_ENV !== "production";
    try {
      linqClient().webhooks.unwrap(rawBody, { headers, key: secret });
      return true;
    } catch {
      return false;
    }
  }

  parseInbound(rawBody: string): InboundEvent | null {
    let event: LinqAPIV3.UnwrapWebhookEvent;
    try {
      event = JSON.parse(rawBody) as LinqAPIV3.UnwrapWebhookEvent;
    } catch {
      return null;
    }
    return normalizeLinqEvent(event);
  }

  async send(providerChatId: string, message: OutboundMessage): Promise<SendResult> {
    const parts: Array<{ type: "text"; value: string } | { type: "link"; value: string } | { type: "media"; url: string } | { type: "media"; attachment_id: string }> = message.link
      ? [{ type: "link", value: message.link }]
      : [{ type: "text", value: message.text }];
    for (const attachment of message.link ? [] : (message.attachments ?? [])) {
      if ("contactCard" in attachment) {
        const name = botNames()[0] ?? "mushy";
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);
        parts.push({ type: "media", attachment_id: await contactCardAttachmentId(displayName, env().LINQ_FROM_NUMBER ?? "") });
      } else {
        parts.push({ type: "media", url: attachment.url });
      }
    }

    const sent = await linqClient().chats.messages.send(
      providerChatId,
      {
        message: {
          parts: parts as never,
          ...(message.replyToProviderMessageId
            ? { reply_to: { message_id: message.replyToProviderMessageId } }
            : {}),
          ...(message.effect ? { effect: { type: "screen" as const, name: message.effect } } : {}),
        },
      },
      message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
    );

    return { providerMessageId: sent.message.id };
  }

  async typing(providerChatId: string, on: boolean): Promise<void> {
    const typing = linqClient().chats.typing;
    if (on) await typing.start(providerChatId);
    else await typing.stop(providerChatId);
  }

  async react(providerMessageId: string, emoji: string): Promise<void> {
    const messages = linqClient().messages as unknown as {
      addReaction?: (id: string, body: { reaction_type: string; custom_emoji?: string }) => Promise<unknown>;
    };
    if (!messages.addReaction) return;
    await messages.addReaction(providerMessageId, { reaction_type: "custom", custom_emoji: emoji });
  }
}
