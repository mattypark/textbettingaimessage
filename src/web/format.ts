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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** "due in 2d", "due in 3h", "due 40m ago" — the deadline as people say it. */
export function dueIn(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const unit = abs >= DAY ? `${Math.round(abs / DAY)}d` : abs >= HOUR ? `${Math.round(abs / HOUR)}h` : `${Math.max(1, Math.round(abs / 60000))}m`;
  return diff >= 0 ? `due in ${unit}` : `due ${unit} ago`;
}

/** First name only; falls back to the last four digits the bot knows. */
export function firstName(displayName: string | null | undefined, phone?: string | null): string {
  if (displayName?.trim()) return displayName.trim().split(/\s+/)[0];
  return phone ? `…${String(phone).slice(-4)}` : "someone";
}
