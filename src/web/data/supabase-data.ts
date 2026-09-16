import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAccessStore } from "@/src/inbound";
import { firstName } from "@/src/web/format";
import { rankChat } from "@/src/web/leaderboard";
import { betDetail, chatBets, chatById, coMembers, myBets, myChats, myWallet } from "@/src/web/queries";
import type { BetDetailView, ChatLeaderboard, ChatSummary, EventView, ProofView, VerdictView, WebData } from "./types";

/** Live implementation: every read goes through the signed-in user's client so RLS scopes it. */
export class SupabaseWebData implements WebData {
  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
  ) {}

  wallet() {
    return myWallet(this.db);
  }

  bets() {
    return myBets(this.db);
  }

  invite() {
    return defaultAccessStore().myInvite(this.userId);
  }

  chats(): Promise<ChatSummary[]> {
    return myChats(this.db);
  }

  async betDetail(id: string): Promise<BetDetailView | null> {
    const [detail, chats] = await Promise.all([betDetail(this.db, id), myChats(this.db)]);
    if (!detail) return null;
    const name = (userId: string) => detail.names.get(userId) ?? "someone";
    const proofs: ProofView[] = detail.proofs.map((p) => ({
      id: p.id,
      mediaUrl: `/api/media/${p.id}`,
      mime: p.mime,
      receivedAt: p.received_at,
      status: p.status,
      submitterName: name(p.submitter_id),
    }));
    const last = detail.verdicts.at(-1);
    const verdict: VerdictView | undefined = last
      ? {
          outcome: last.outcome as VerdictView["outcome"],
          confidence: Number(last.confidence),
          pass: Number(last.pass),
          createdAt: last.created_at,
          reasoning: last.reasoning,
          checks: (last.criteria_checks as VerdictView["checks"]) ?? [],
        }
      : undefined;
    const events: EventView[] = detail.events.map((e) => ({
      version: e.version,
      toStatus: e.to_status as EventView["toStatus"],
      type: String((e.event as { type?: string }).type ?? "event"),
      createdAt: e.created_at,
    }));
    const chatName = chats.find((c) => c.id === detail.bet.chatId)?.name ?? null;
    return { bet: detail.bet, chatName, proofs, verdict, events, names: detail.names };
  }

  async leaderboard(chatId: string): Promise<ChatLeaderboard | null> {
    const [chat, bets, users] = await Promise.all([chatById(this.db, chatId), chatBets(this.db, chatId), coMembers(this.db)]);
    if (!chat) return null;
    const members = users.map((u) => ({ id: u.id, name: firstName(u.displayName, u.phone), honor: u.honorScore }));
    return { chat, rows: rankChat(bets, members, this.userId) };
  }
}
