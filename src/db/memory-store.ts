import type { InboundEvent, OutboundMessage } from "@/src/transport/types";
import type { ChatRow, OutboxRow, Store, UserRow } from "./store";

/** In-memory Store for unit tests and the replay harness. */
export class MemoryStore implements Store {
  readonly inbox = new Map<string, { id: string; status: string; error?: string; chatId?: string; event: InboundEvent }>();
  readonly chats = new Map<string, ChatRow>();
  readonly users = new Map<string, UserRow>();
  readonly members = new Set<string>();
  readonly outbox: Array<OutboxRow & { status: string; providerMessageId?: string; error?: string }> = [];
  private seq = 0;

  private nextId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  async claimInbound(event: InboundEvent): Promise<string | null> {
    const key = `${event.provider}:${event.providerMessageId}`;
    if (this.inbox.has(key)) return null;
    const id = this.nextId("in");
    this.inbox.set(key, { id, status: "pending", event });
    return id;
  }

  private inboxById(id: string) {
    for (const row of this.inbox.values()) if (row.id === id) return row;
    throw new Error(`inbox row ${id} not found`);
  }

  async markInbound(id: string, status: "processing" | "processed" | "ignored" | "failed", error?: string): Promise<void> {
    const row = this.inboxById(id);
    row.status = status;
    row.error = error;
  }

  async attachNormalized(id: string, chatId: string, event: InboundEvent): Promise<void> {
    const row = this.inboxById(id);
    row.chatId = chatId;
    row.event = event;
  }

  async upsertChat(event: InboundEvent): Promise<ChatRow> {
    const key = `${event.provider}:${event.providerChatId}`;
    const existing = this.chats.get(key);
    if (existing) return existing;
    const row: ChatRow = {
      id: this.nextId("chat"),
      provider: event.provider,
      providerChatId: event.providerChatId,
      isGroup: event.isGroup,
      botIntroducedAt: null,
    };
    this.chats.set(key, row);
    return row;
  }

  async upsertUser(handle: string): Promise<UserRow> {
    const existing = this.users.get(handle);
    if (existing) return existing;
    const row: UserRow = { id: this.nextId("user"), phone: handle, displayName: null };
    this.users.set(handle, row);
    return row;
  }

  async upsertMember(chatId: string, userId: string): Promise<void> {
    this.members.add(`${chatId}:${userId}`);
  }

  async markIntroduced(chatId: string): Promise<void> {
    for (const chat of this.chats.values()) {
      if (chat.id === chatId) chat.botIntroducedAt = new Date().toISOString();
    }
  }

  async enqueueOutbound(chatId: string, body: OutboundMessage, idempotencyKey: string): Promise<OutboxRow | null> {
    if (this.outbox.some((row) => row.idempotencyKey === idempotencyKey)) return null;
    const row = { id: this.nextId("out"), chatId, body, idempotencyKey, status: "queued" };
    this.outbox.push(row);
    return row;
  }

  async markOutbound(id: string, status: "sent" | "failed", providerMessageId?: string, error?: string): Promise<void> {
    const row = this.outbox.find((r) => r.id === id);
    if (!row) throw new Error(`outbox row ${id} not found`);
    row.status = status;
    row.providerMessageId = providerMessageId;
    row.error = error;
  }

  async chatProviderId(chatId: string): Promise<{ provider: string; providerChatId: string } | null> {
    for (const chat of this.chats.values()) {
      if (chat.id === chatId) return { provider: chat.provider, providerChatId: chat.providerChatId };
    }
    return null;
  }

  async recentOutboundIds(chatId: string, limit: number): Promise<string[]> {
    return this.outbox
      .filter((row) => row.chatId === chatId && row.status === "sent" && row.providerMessageId)
      .map((row) => row.providerMessageId as string)
      .reverse()
      .slice(0, limit);
  }
}
