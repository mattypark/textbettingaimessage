import { rankChat } from "@/src/web/leaderboard";
import type { BetDetailView, BetListItem, ChatLeaderboard, ChatSummary, InviteView, Viewer, WalletView, WebData } from "@/src/web/data/types";
import { DEMO_BETS, DEMO_CHATS, DEMO_INVITE, DEMO_NAMES, DEMO_PROOFS, DEMO_USERS, DEMO_USER_ID, DEMO_VERDICTS, DEMO_WALLET, demoEvents } from "./seed";

export const DEMO_VIEWER: Viewer = { userId: DEMO_USER_ID, name: "Matt", phoneTail: "0123", live: false };

/** In-memory WebData over the seed. Same shapes the Supabase adapter returns. */
export class DemoWebData implements WebData {
  async wallet(): Promise<WalletView> {
    return DEMO_WALLET;
  }

  async bets(): Promise<BetListItem[]> {
    const chatName = new Map(DEMO_CHATS.map((c) => [c.id, c.name]));
    return DEMO_BETS.map((bet) => ({ bet, chatName: chatName.get(bet.chatId) ?? null }));
  }

  async betDetail(id: string): Promise<BetDetailView | null> {
    const bet = DEMO_BETS.find((b) => b.id === id);
    if (!bet) return null;
    return {
      bet,
      chatName: DEMO_CHATS.find((c) => c.id === bet.chatId)?.name ?? null,
      proofs: DEMO_PROOFS[id] ?? [],
      verdict: DEMO_VERDICTS[id],
      events: demoEvents(id),
      names: DEMO_NAMES,
    };
  }

  async invite(): Promise<InviteView> {
    return DEMO_INVITE;
  }

  async chats(): Promise<ChatSummary[]> {
    return DEMO_CHATS;
  }

  async leaderboard(chatId: string): Promise<ChatLeaderboard | null> {
    const chat = DEMO_CHATS.find((c) => c.id === chatId);
    if (!chat) return null;
    const bets = DEMO_BETS.filter((b) => b.chatId === chatId);
    const members = DEMO_USERS.map((u) => ({ id: u.id, name: u.name, honor: u.honor }));
    return { chat, rows: rankChat(bets, members, DEMO_USER_ID) };
  }
}
