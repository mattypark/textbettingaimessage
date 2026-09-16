import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundEvent, OutboundMessage } from "@/src/transport/types";
import type { ChatRow, MemberRow, OutboxRow, Store, StuckInboundRow, UserRow } from "./store";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/** Store backed by Supabase through the service-role client. */
export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  async claimInbound(event: InboundEvent): Promise<string | null> {
    const { data, error } = await this.db.rpc("claim_inbound", {
      p_provider: event.provider,
      p_provider_message_id: event.providerMessageId,
      p_direction: "in",
      p_sender_handle: event.senderHandle,
      p_raw: event.raw ?? null,
    });
    if (error) fail("claim_inbound", error);
    return (data as string | null) ?? null;
  }

  async markInbound(id: string, status: "processing" | "processed" | "ignored" | "failed", error?: string): Promise<void> {
    const patch: Record<string, unknown> = { status, last_error: error ?? null };
    if (status === "processed" || status === "ignored" || status === "failed") patch.processed_at = new Date().toISOString();
    const { error: dbError } = await this.db.from("provider_messages").update(patch).eq("id", id);
    if (dbError) fail("markInbound", dbError);
  }

  async attachNormalized(id: string, chatId: string, event: InboundEvent): Promise<void> {
    const normalized = { ...event, raw: undefined };
    const { error } = await this.db
      .from("provider_messages")
      .update({ chat_id: chatId, normalized })
      .eq("id", id);
    if (error) fail("attachNormalized", error);
  }

  async upsertChat(event: InboundEvent): Promise<ChatRow> {
    const { data, error } = await this.db
      .from("chats")
      .upsert(
        { provider: event.provider, provider_chat_id: event.providerChatId, is_group: event.isGroup },
        { onConflict: "provider,provider_chat_id", ignoreDuplicates: false }
      )
      .select("id, provider, provider_chat_id, is_group, bot_introduced_at")
      .single();
    if (error || !data) fail("upsertChat", error);
    return {
      id: data.id,
      provider: data.provider,
      providerChatId: data.provider_chat_id,
      isGroup: data.is_group,
      botIntroducedAt: data.bot_introduced_at,
    };
  }

  async upsertUser(handle: string): Promise<UserRow> {
    const { data, error } = await this.db
      .from("users")
      .upsert({ phone: handle }, { onConflict: "phone" })
      .select("id, phone, display_name")
      .single();
    if (error || !data) fail("upsertUser", error);
    return { id: data.id, phone: data.phone, displayName: data.display_name };
  }

  async upsertMember(chatId: string, userId: string, handle: string): Promise<void> {
    const { error } = await this.db
      .from("chat_members")
      .upsert(
        { chat_id: chatId, user_id: userId, handle, last_seen_at: new Date().toISOString() },
        { onConflict: "chat_id,user_id" }
      );
    if (error) fail("upsertMember", error);
  }

  async hasAcceptedTerms(userId: string, version: number): Promise<boolean> {
    const { data, error } = await this.db.from("terms_acceptances").select("id").eq("user_id", userId).eq("terms_version", version).maybeSingle();
    if (error) fail("hasAcceptedTerms", error);
    return Boolean(data);
  }

  async recordTermsAcceptance(userId: string, version: number, via: "imessage" | "web", providerMessageId?: string): Promise<void> {
    const { error } = await this.db
      .from("terms_acceptances")
      .upsert({ user_id: userId, terms_version: version, accepted_via: via, provider_message_id: providerMessageId ?? null }, { onConflict: "user_id,terms_version", ignoreDuplicates: true });
    if (error) fail("recordTermsAcceptance", error);
  }

  async termsMessageId(chatId: string): Promise<string | null> {
    const { data, error } = await this.db.from("chats").select("terms_message_provider_id").eq("id", chatId).maybeSingle();
    if (error) fail("termsMessageId", error);
    return data?.terms_message_provider_id ?? null;
  }

  async setDisplayName(userId: string, name: string): Promise<void> {
    const { error } = await this.db.from("users").update({ display_name: name }).eq("id", userId);
    if (error) fail("setDisplayName", error);
  }

  async chatMembers(chatId: string): Promise<MemberRow[]> {
    const { data, error } = await this.db
      .from("chat_members")
      .select("user_id, handle, users(id, phone, display_name, honor_score)")
      .eq("chat_id", chatId);
    if (error) fail("chatMembers", error);
    return (data ?? []).map((row) => {
      const u = (Array.isArray(row.users) ? row.users[0] : row.users) as { id: string; phone: string; display_name: string | null; honor_score: number };
      return { id: u.id, phone: u.phone, displayName: u.display_name, honorScore: u.honor_score };
    });
  }

  async markIntroduced(chatId: string, providerMessageId: string | null): Promise<void> {
    const { error } = await this.db
      .from("chats")
      .update({ bot_introduced_at: new Date().toISOString(), terms_message_provider_id: providerMessageId })
      .eq("id", chatId);
    if (error) fail("markIntroduced", error);
  }

  async enqueueOutbound(chatId: string, body: OutboundMessage, idempotencyKey: string): Promise<OutboxRow | null> {
    const { data, error } = await this.db
      .from("outbound_messages")
      .upsert({ chat_id: chatId, body, idempotency_key: idempotencyKey }, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id, chat_id, body, idempotency_key")
      .maybeSingle();
    if (error) fail("enqueueOutbound", error);
    if (!data) return null;
    return { id: data.id, chatId: data.chat_id, body: data.body as OutboundMessage, idempotencyKey: data.idempotency_key };
  }

  async markOutbound(id: string, status: "sent" | "failed", providerMessageId?: string, error?: string): Promise<void> {
    const { error: dbError } = await this.db
      .from("outbound_messages")
      .update({
        status,
        provider_message_id: providerMessageId ?? null,
        last_error: error ?? null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (dbError) fail("markOutbound", dbError);
    await this.db.rpc("bump_outbound_attempt", { p_id: id });
  }

  async chatProviderId(chatId: string): Promise<{ provider: string; providerChatId: string } | null> {
    const { data, error } = await this.db.from("chats").select("provider, provider_chat_id").eq("id", chatId).maybeSingle();
    if (error) fail("chatProviderId", error);
    return data ? { provider: data.provider, providerChatId: data.provider_chat_id } : null;
  }

  async queuedOutbound(limit: number, maxAttempts: number): Promise<OutboxRow[]> {
    const { data, error } = await this.db
      .from("outbound_messages")
      .select("id, chat_id, body, idempotency_key")
      .in("status", ["queued", "failed"])
      .lt("attempts", maxAttempts)
      .lte("not_before", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) fail("queuedOutbound", error);
    return (data ?? []).map((row) => ({ id: row.id, chatId: row.chat_id, body: row.body as OutboundMessage, idempotencyKey: row.idempotency_key }));
  }

  async stuckInbound(staleMs: number, limit: number, maxAttempts: number): Promise<StuckInboundRow[]> {
    const { data, error } = await this.db
      .from("provider_messages")
      .select("id, chat_id, normalized, raw, attempts")
      .in("status", ["pending", "processing"])
      .lt("attempts", maxAttempts)
      .lte("received_at", new Date(Date.now() - staleMs).toISOString())
      .order("received_at", { ascending: true })
      .limit(limit);
    if (error) fail("stuckInbound", error);
    return (data ?? [])
      .filter((row) => row.normalized)
      .map((row) => ({ id: row.id, chatId: row.chat_id, event: { ...(row.normalized as InboundEvent), raw: row.raw }, attempts: row.attempts }));
  }

  async bumpInboundAttempt(id: string): Promise<void> {
    const { error } = await this.db.rpc("bump_inbound_attempt", { p_id: id });
    if (error) fail("bumpInboundAttempt", error);
  }

  async recentOutboundIds(chatId: string, limit: number): Promise<string[]> {
    const { data, error } = await this.db
      .from("outbound_messages")
      .select("provider_message_id")
      .eq("chat_id", chatId)
      .eq("status", "sent")
      .not("provider_message_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (error) fail("recentOutboundIds", error);
    return (data ?? []).map((row) => row.provider_message_id as string);
  }
}
