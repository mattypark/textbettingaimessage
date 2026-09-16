import type { Bet, BetStatus, Outcome } from "@/src/bets/types";
import type { InviteView } from "@/src/access/store";
import type { BetListItem, WalletView } from "@/src/web/queries";

/** Who is looking. `live` is false in demo mode, which turns off Realtime and RPC calls. */
export interface Viewer {
  userId: string;
  name: string;
  phoneTail: string;
  live: boolean;
}

export interface ProofView {
  id: string;
  /** Where the browser can load the media. `/api/media/<id>` live, a static file in demo. */
  mediaUrl: string;
  mime: string;
  receivedAt: string;
  status: string;
  submitterName: string;
}

export interface CriterionCheck {
  criterion: string;
  met: boolean;
  evidence: string;
}

export interface VerdictView {
  outcome: Outcome;
  confidence: number;
  pass: number;
  createdAt: string;
  reasoning: string;
  checks: CriterionCheck[];
}

export interface EventView {
  version: number;
  toStatus: BetStatus;
  type: string;
  createdAt: string;
}

export interface BetDetailView {
  bet: Bet;
  chatName: string | null;
  proofs: ProofView[];
  verdict?: VerdictView;
  events: EventView[];
  /** userId → display name for everyone on the bet. */
  names: Map<string, string>;
}

export interface ChatSummary {
  id: string;
  name: string | null;
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  honor: number;
  netPoints: bigint;
  wins: number;
  losses: number;
  isViewer: boolean;
}

export interface ChatLeaderboard {
  chat: ChatSummary;
  rows: LeaderboardRow[];
}

/** Everything /app reads. One implementation per backend; pages never see Supabase. */
export interface WebData {
  wallet(): Promise<WalletView | null>;
  bets(): Promise<BetListItem[]>;
  betDetail(id: string): Promise<BetDetailView | null>;
  invite(): Promise<InviteView | null>;
  chats(): Promise<ChatSummary[]>;
  leaderboard(chatId: string): Promise<ChatLeaderboard | null>;
}

export type { BetListItem, WalletView, InviteView };
