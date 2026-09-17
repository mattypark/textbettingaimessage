import { z } from "zod";
import type { Stake } from "@/src/ledger/types";

export const BET_STATUSES = [
  "proposed",
  "locked",
  "proof_submitted",
  "judging",
  "verdict_posted",
  "disputed",
  "settled",
  "expired",
  "cancelled",
  "voided",
] as const;
export type BetStatus = (typeof BET_STATUSES)[number];

export type Side = "for" | "against";
export type Outcome = "for" | "against" | "inconclusive";

/** What a judge must see. Locked at creation; never re-read from chat. */
export const ProofCriteriaSchema = z.object({
  summary: z.string().min(1),
  required: z.array(z.string().min(1)).min(1),
  optional: z.array(z.string()).default([]),
  /** Bot issues a random word at lock; proof must show it unless waived here. */
  challengeTokenRequired: z.boolean().default(true),
  mediaKinds: z.array(z.enum(["photo", "video"])).default(["photo", "video"]),
});
export type ProofCriteria = z.infer<typeof ProofCriteriaSchema>;

export interface Participant {
  userId: string;
  side: Side;
  /** Required participants must accept before the bet locks. */
  required: boolean;
  acceptedAt?: string;
}

export interface Verdict {
  outcome: Exclude<Outcome, "inconclusive">;
  confidence: number;
  pass: 1 | 2;
  proofId?: string;
}

export interface Dispute {
  id: string;
  disputerId: string;
  /** Verdict the disputer is challenging. */
  challenged: Exclude<Outcome, "inconclusive">;
  reason?: string;
  openedAt: string;
}

/**
 * Real-money social stake held by a friend in the chat, never by us. Each
 * bettor pays the holder through their own app; the holder pays the winner.
 * The bot only tracks who said "paid" and who said "got it".
 */
export interface Funding {
  holderUserId: string;
  amountUsd: number;
  /** userId → ISO time they said they paid the holder. */
  paid: Record<string, string>;
  /** ISO time the holder confirmed the pot is full. */
  confirmedAt?: string;
}

export interface Bet {
  id: string;
  chatId: string;
  creatorId: string;
  status: BetStatus;
  claim: string;
  stake: Stake;
  participants: Participant[];
  proofCriteria: ProofCriteria;
  judgeKind: "bot" | "referee";
  refereeUserId?: string;
  /** Open bets let anyone in the chat take the other side by reacting. */
  open?: boolean;
  /** Provider id of the card message whose tapbacks count as accepts. */
  cardProviderMessageId?: string;
  /** ISO timestamps */
  createdAt: string;
  acceptByAt: string;
  deadlineAt: string;
  proofGraceHours: number;
  noProofRule: "auto_loss" | "void";
  lockedAt?: string;
  challengeToken?: string;
  latestProofId?: string;
  verdict?: Verdict;
  /** Present only for dollar-worded social stakes with a named holder. */
  funding?: Funding;
  /** ISO time the "proof due soon" nudge went out; one per bet. */
  reminderSentAt?: string;
  disputeWindowEndsAt?: string;
  dispute?: Dispute;
  resolvedAt?: string;
  version: number;
}

export const ACCEPT_WINDOW_HOURS = 24;
export const DISPUTE_WINDOW_HOURS = 24;
export const REFEREE_SILENCE_HOURS = 48;
export const MIN_JUDGE_CONFIDENCE = 0.7;
export const DISPUTE_BOND_RATIO = 0.5; // bond = half the stake, min 1
