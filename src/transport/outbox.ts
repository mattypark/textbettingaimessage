import type { Store } from "@/src/db/store";
import type { MessageTransport, OutboundMessage } from "./types";

/**
 * Every reply is queued in the outbox first, then sent. A crash between the
 * two leaves a `queued` row that the cron tick drains; the idempotency key
 * (inbound message id + ordinal) prevents a second send on replay.
 */
export class Outbox {
  constructor(
    private readonly store: Store,
    private readonly transport: MessageTransport
  ) {}

  async send(chatId: string, message: OutboundMessage, idempotencyKey: string): Promise<string | null> {
    const row = await this.store.enqueueOutbound(chatId, message, idempotencyKey);
    if (!row) return null; // already queued/sent for this key
    return this.deliver(row.id, chatId, { ...message, idempotencyKey });
  }

  async deliver(rowId: string, chatId: string, message: OutboundMessage): Promise<string | null> {
    const target = await this.store.chatProviderId(chatId);
    if (!target) {
      await this.store.markOutbound(rowId, "failed", undefined, "chat has no provider id");
      return null;
    }
    try {
      const { providerMessageId } = await this.transport.send(target.providerChatId, message);
      await this.store.markOutbound(rowId, "sent", providerMessageId);
      return providerMessageId;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.store.markOutbound(rowId, "failed", undefined, detail);
      throw error;
    }
  }
}
