import type { Bet } from "@/src/bets/types";

export const STATUS_LABEL: Record<Bet["status"], string> = {
  proposed: "waiting on 👍",
  locked: "locked",
  proof_submitted: "proof in",
  judging: "judging",
  verdict_posted: "verdict — 24h to dispute",
  disputed: "disputed",
  settled: "settled",
  expired: "expired",
  cancelled: "cancelled",
  voided: "voided",
};

export function stakeText(bet: Bet): string {
  return bet.stake.kind === "social" ? (bet.stake.description ?? "social stake") : `${bet.stake.amount} pts`;
}

export function shortId(id: string): string {
  return `#${id.slice(0, 6)}`;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export const TERMINAL = new Set<Bet["status"]>(["settled", "expired", "cancelled", "voided"]);
