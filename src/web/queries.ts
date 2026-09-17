import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bet } from "@/src/bets/types";

export interface WalletView {
  available: bigint;
  held: bigint;
  honorScore: number;
  termsVersionAccepted: number | null;
}

export interface BetListItem {
  bet: Bet;
  chatName: string | null;
}

function deserialize(state: Record<string, unknown>): Bet {
  const stake = state.stake as { amount: string | number; kind: Bet["stake"]["kind"]; currency: string; description?: string };
  return { ...(state as unknown as Bet), stake: { ...stake, amount: BigInt(stake.amount) } };
}

/** Everything the dashboard shows, read as the signed-in user so RLS does the scoping. */
export async function myWallet(db: SupabaseClient): Promise<WalletView | null> {
  const { data, error } = await db.rpc("my_wallet").maybeSingle();
  if (error) throw new Error(`my_wallet: ${error.message}`);
  if (!data) return null;
  const row = data as { available: number | string; held: number | string; honor_score: number; terms_version_accepted: number | null };
  return { available: BigInt(row.available ?? 0), held: BigInt(row.held ?? 0), honorScore: row.honor_score ?? 100, termsVersionAccepted: row.terms_version_accepted };
}

export async function myBets(db: SupabaseClient): Promise<BetListItem[]> {
  const { data, error } = await db.from("bets").select("state, chats(name)").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`bets: ${error.message}`);
  return (data ?? []).map((row) => {
    const chat = (Array.isArray(row.chats) ? row.chats[0] : row.chats) as { name: string | null } | null;
    return { bet: deserialize(row.state as Record<string, unknown>), chatName: chat?.name ?? null };
  });
}

export async function betDetail(db: SupabaseClient, betId: string) {
  const [{ data: betRow, error }, { data: proofs }, { data: verdicts }, { data: events }, { data: members }] = await Promise.all([
    db.from("bets").select("state").eq("id", betId).maybeSingle(),
    db.from("proofs").select("id, storage_path, mime, received_at, status, submitter_id").eq("bet_id", betId).order("received_at"),
    db.from("verdicts").select("pass, outcome, confidence, criteria_checks, challenge_token_visible, tamper_flags, reasoning, created_at").eq("bet_id", betId).order("created_at"),
    db.from("bet_events").select("version, from_status, to_status, event, created_at").eq("bet_id", betId).order("version"),
    db.from("users").select("id, phone, display_name, honor_score"),
  ]);
  if (error) throw new Error(`bet: ${error.message}`);
  if (!betRow) return null;
  const names = new Map((members ?? []).map((m) => [m.id, m.display_name ?? `…${String(m.phone).slice(-4)}`]));
  return { bet: deserialize(betRow.state as Record<string, unknown>), proofs: proofs ?? [], verdicts: verdicts ?? [], events: events ?? [], names };
}

export async function myChats(db: SupabaseClient): Promise<Array<{ id: string; name: string | null }>> {
  const { data, error } = await db.from("chats").select("id, name").order("created_at", { ascending: false });
  if (error) throw new Error(`chats: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id as string, name: (c.name as string | null) ?? null }));
}

export async function chatById(db: SupabaseClient, chatId: string): Promise<{ id: string; name: string | null } | null> {
  const { data, error } = await db.from("chats").select("id, name").eq("id", chatId).maybeSingle();
  if (error) throw new Error(`chat: ${error.message}`);
  return data ? { id: data.id as string, name: (data.name as string | null) ?? null } : null;
}

export interface LeaderboardRpcRow {
  userId: string;
  displayName: string | null;
  phone: string;
  honor: number;
  netPoints: bigint;
  wins: number;
  losses: number;
  available: bigint;
}

/** Ranked members of one chat (migration 0011). Empty when the caller is not a member. */
export async function chatLeaderboard(db: SupabaseClient, chatId: string): Promise<LeaderboardRpcRow[]> {
  const { data, error } = await db.rpc("chat_leaderboard", { p_chat_id: chatId });
  if (error) throw new Error(`chat_leaderboard: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    userId: String(r.user_id),
    displayName: (r.display_name as string | null) ?? null,
    phone: String(r.phone),
    honor: Number(r.honor ?? 100),
    netPoints: BigInt((r.net_points as string | number) ?? 0),
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    available: BigInt((r.available as string | number) ?? 0),
  }));
}
