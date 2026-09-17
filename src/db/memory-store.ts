import type { InboundEvent, OutboundMessage } from "@/src/transport/types";
import type { ChatRow, MemberRow, OutboxRow, Store, StuckInboundRow, UserRow } from "./store";

/** In-memory Store for unit tests and the replay harness. */
export class MemoryStore implements Store {
  readonly inbox = new Map<string, { id: string; status: string; error?: string; chatId?: string; event: InboundEvent; attempts: number; at: number }>();
  readonly chats = new Map<string, ChatRow>();
  readonly users = new Map<string, UserRow>();
  readonly members = new Set<string>();
  readonly terms = new Set<string>();
  readonly termsVia = new Map<string, string>();
  readonly termsMessages = new Map<string, string>();
  readonly outbox: Array<OutboxRow & { status: string; providerMessageId?: string; error?: string; attempts: number; sentAt?: string }> = [];
  private seq = 0;

  private nextId(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }

  async claimInbound(event: InboundEvent): Promise<string | null> {
    const key = `${event.provider}:${event.providerMessageId}`;
    if (this.inbox.has(key)) return null;
    const id = this.nextId("in");
    this.inbox.set(key, { id, status: "pending", event, attempts: 0, at: Date.now() });
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

  async upsertMember(chatId: string, userId: string, handle: string): Promise<void> {
    void handle; // memory users are keyed by handle already
    this.members.add(`${chatId}:${userId}`);
  }

  async hasAcceptedTerms(userId: string, version: number): Promise<boolean> {
    return this.terms.has(`${userId}:${version}`);
  }

  async recordTermsAcceptance(userId: string, version: number, via: "imessage" | "web" = "imessage"): Promise<void> {
    this.terms.add(`${userId}:${version}`);
    this.termsVia.set(`${userId}:${version}`, via);
  }

  async termsMessageId(chatId: string): Promise<string | null> {
    return this.termsMessages.get(chatId) ?? null;
  }

  async setDisplayName(userId: string, name: string): Promise<void> {
    for (const user of this.users.values()) if (user.id === userId) user.displayName = name;
  }

  async chatMembers(chatId: string): Promise<MemberRow[]> {
    const ids = [...this.members].filter((m) => m.startsWith(`${chatId}:`)).map((m) => m.slice(chatId.length + 1));
    return [...this.users.values()].filter((u) => ids.includes(u.id)).map((u) => ({ ...u, honorScore: 100 }));
  }

  async markIntroduced(chatId: string, providerMessageId: string | null): Promise<void> {
    for (const chat of this.chats.values()) {
      if (chat.id === chatId) chat.botIntroducedAt = new Date().toISOString();
    }
    if (providerMessageId) this.termsMessages.set(chatId, providerMessageId);
  }

  async enqueueOutbound(chatId: string, body: OutboundMessage, idempotencyKey: string): Promise<OutboxRow | null> {
    if (this.outbox.some((row) => row.idempotencyKey === idempotencyKey)) return null;
    const row = { id: this.nextId("out"), chatId, body, idempotencyKey, status: "queued", attempts: 0 };
    this.outbox.push(row);
    return row;
  }

  async markOutbound(id: string, status: "sent" | "failed", providerMessageId?: string, error?: string): Promise<void> {
    const row = this.outbox.find((r) => r.id === id);
    if (!row) throw new Error(`outbox row ${id} not found`);
    row.status = status;
    row.providerMessageId = providerMessageId;
    row.error = error;
    row.attempts += 1;
    if (status === "sent") row.sentAt = new Date().toISOString();
  }

  async lastOutboundAt(chatId: string): Promise<string | null> {
    const sent = this.outbox.filter((row) => row.chatId === chatId && row.status === "sent" && row.sentAt);
    return sent.length ? (sent[sent.length - 1].sentAt as string) : null;
  }

  async queuedOutbound(limit: number, maxAttempts: number): Promise<OutboxRow[]> {
    return this.outbox.filter((r) => (r.status === "queued" || r.status === "failed") && r.attempts < maxAttempts).slice(0, limit);
  }

  async stuckInbound(staleMs: number, limit: number, maxAttempts: number): Promise<StuckInboundRow[]> {
    const cutoff = Date.now() - staleMs;
    return [...this.inbox.values()]
      .filter((r) => (r.status === "pending" || r.status === "processing") && r.at <= cutoff && r.attempts < maxAttempts)
      .slice(0, limit)
      .map((r) => ({ id: r.id, chatId: r.chatId ?? null, event: r.event, attempts: r.attempts }));
  }

  async bumpInboundAttempt(id: string): Promise<void> {
    this.inboxById(id).attempts += 1;
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
