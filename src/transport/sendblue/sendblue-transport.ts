import { timingSafeEqual } from "node:crypto";
import { env } from "@/src/config/env";
import { normalizeSendblue, type SendblueWebhook } from "./parse";
import type {
  InboundEvent,
  MessageTransport,
  OutboundMessage,
  SendResult,
  VerifyInput,
} from "../types";

const API_BASE = "https://api.sendblue.com/api";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Sendblue adapter. Sendblue does not sign webhooks; we register the webhook
 * with a secret header we generate and compare it here. Reactions may arrive
 * as text on fallback paths — see `TEXT_REACTION` in ./parse.
 */
export class SendblueTransport implements MessageTransport {
  readonly name = "sendblue" as const;

  verify({ headers }: VerifyInput): boolean {
    const secret = env().SENDBLUE_SIGNING_SECRET;
    if (!secret) return env().NODE_ENV !== "production";
    const presented = headers["sb-signing-secret"] ?? "";
    return constantTimeEqual(presented, secret);
  }

  parseInbound(rawBody: string): InboundEvent | null {
    let body: SendblueWebhook;
    try {
      body = JSON.parse(rawBody) as SendblueWebhook;
    } catch {
      return null;
    }
    return normalizeSendblue(body);
  }

  private headers(): Record<string, string> {
    const { SENDBLUE_API_KEY, SENDBLUE_API_SECRET } = env();
    if (!SENDBLUE_API_KEY || !SENDBLUE_API_SECRET) {
      throw new Error("Sendblue is not configured. Set SENDBLUE_API_KEY and SENDBLUE_API_SECRET.");
    }
    return {
      "content-type": "application/json",
      "sb-api-key-id": SENDBLUE_API_KEY,
      "sb-api-secret-key": SENDBLUE_API_SECRET,
    };
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const detail = typeof json.error_message === "string" ? json.error_message : response.statusText;
      const error = new Error(`Sendblue ${path} failed (${response.status}): ${detail}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return json;
  }

  async send(providerChatId: string, message: OutboundMessage): Promise<SendResult> {
    const isGroup = !providerChatId.startsWith("+");
    const body: Record<string, unknown> = {
      content: message.text,
      from_number: env().SENDBLUE_FROM_NUMBER,
      ...(message.attachments?.[0] && "url" in message.attachments[0] ? { media_url: message.attachments[0].url } : {}),
      ...(message.effect === "confetti" ? { send_style: "confetti" } : {}),
    };
    const result = isGroup
      ? await this.post("/send-group-message", { ...body, group_id: providerChatId })
      : await this.post("/send-message", { ...body, number: providerChatId });
    return { providerMessageId: String(result.message_handle ?? "") };
  }

  async typing(providerChatId: string, on: boolean): Promise<void> {
    if (!on) return;
    // Sendblue's indicator is per-number; groups have no typing endpoint.
    if (!providerChatId.startsWith("+")) return;
    await this.post("/send-typing-indicator", { number: providerChatId }).catch(() => undefined);
  }

  async react(providerMessageId: string, emoji: string): Promise<void> {
    await this.post("/send-reaction", { message_handle: providerMessageId, reaction: emoji }).catch(
      () => undefined
    );
  }
}
