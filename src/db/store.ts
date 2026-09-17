import type { InboundEvent, OutboundMessage } from "@/src/transport/types";

/**
 * Persistence boundary for the inbound pipeline. `SupabaseStore` is the real
 * one; `MemoryStore` backs unit tests and the replay harness so the pipeline
 * can be exercised with no database.
 */
export interface ChatRow {
  id: string;
  provider: string;
  providerChatId: string;
  isGroup: boolean;
  botIntroducedAt: string | null;
}

export interface UserRow {
  id: string;
  phone: string;
  displayName: string | null;
}

export interface MemberRow extends UserRow {
  honorScore: number;
}

export interface OutboxRow {
  id: string;
  chatId: string;
  body: OutboundMessage;
  idempotencyKey: string;
}

export interface StuckInboundRow {
  id: string;
  chatId: string | null;
  event: InboundEvent;
  attempts: number;
}

export interface BetDraft {
  chatId: string;
  userId: string;
  step: "claim" | "stake" | "deadline";
  claim?: string;
  /** Serialized stake: amount as a string so JSON survives. */
  stake?: { kind: "points" | "social"; amount: string; currency: string; description?: string };
  /** Set once all three answers are in but the terms were not yet accepted. */
  deadlineAt?: string;
  createdAt: string;
}

export interface SignatureRow {
  chatId: string | null;
  userId: string;
  phone: string;
  fullName: string;
  signature: string;
  termsVersion: number;
  ip?: string;
  userAgent?: string;
}

export interface Store {
  /** E-sign record from the sign sheet; the terms acceptance itself is recorded separately. */
  recordSignature(row: SignatureRow): Promise<void>;
  /** Scripted bet builder state, one per person per chat. */
  getDraft(chatId: string, userId: string): Promise<BetDraft | null>;
  setDraft(draft: BetDraft): Promise<void>;
  clearDraft(chatId: string, userId: string): Promise<void>;
  /** Returns the inbox row id, or null if this provider message was already claimed. */
  claimInbound(event: InboundEvent): Promise<string | null>;
  markInbound(id: string, status: "processing" | "processed" | "ignored" | "failed", error?: string): Promise<void>;
  attachNormalized(id: string, chatId: string, event: InboundEvent): Promise<void>;
  upsertChat(event: InboundEvent): Promise<ChatRow>;
  upsertUser(handle: string): Promise<UserRow>;
  upsertMember(chatId: string, userId: string, handle: string): Promise<void>;
  setDisplayName(userId: string, name: string): Promise<void>;
  /** Payment handles for settle-up links ({ venmo: "matt", ... }); never money itself. */
  setPayHandle(userId: string, provider: string, handle: string): Promise<void>;
  payHandles(userId: string): Promise<Record<string, string>>;
  hasAcceptedTerms(userId: string, version: number): Promise<boolean>;
  recordTermsAcceptance(userId: string, version: number, via: "imessage" | "web", providerMessageId?: string): Promise<void>;
  /** Provider id of the intro/terms message in a chat, if posted. */
  termsMessageId(chatId: string): Promise<string | null>;
  chatMembers(chatId: string): Promise<MemberRow[]>;
  markIntroduced(chatId: string, providerMessageId: string | null): Promise<void>;
  enqueueOutbound(chatId: string, body: OutboundMessage, idempotencyKey: string): Promise<OutboxRow | null>;
  markOutbound(id: string, status: "sent" | "failed", providerMessageId?: string, error?: string): Promise<void>;
  chatProviderId(chatId: string): Promise<{ provider: string; providerChatId: string } | null>;
  /** Provider ids of messages we sent into a chat, newest first. */
  recentOutboundIds(chatId: string, limit: number): Promise<string[]>;
  /** When we last successfully sent into a chat (ISO), or null. Drives the follow-up attention window. */
  lastOutboundAt(chatId: string): Promise<string | null>;
  /** Outbox rows still queued (or failed under the retry cap) whose not_before has passed. */
  queuedOutbound(limit: number, maxAttempts: number): Promise<OutboxRow[]>;
  /** Inbox rows stuck in pending/processing longer than `staleMs`, under the retry cap. */
  stuckInbound(staleMs: number, limit: number, maxAttempts: number): Promise<StuckInboundRow[]>;
  bumpInboundAttempt(id: string): Promise<void>;
}
