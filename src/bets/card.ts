import { BOT_TZ } from "./tz";
import type { Bet } from "./types";
import type { PostKind } from "./state-machine";

/**
 * Renders the bot's messages for a bet. Deterministic text — no LLM — so the
 * same state always reads the same way and snapshot tests hold.
 */
export interface Names {
  (userId: string): string;
}

function stakeLine(bet: Bet): string {
  if (bet.stake.kind === "social") return bet.stake.description ?? "social stake";
  return `${bet.stake.amount} pts each`;
}

/** Deadlines read in the group's zone, not the server's. */
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: BOT_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function betCard(bet: Bet, name: Names): string {
  const forSide = bet.participants.filter((p) => p.side === "for").map((p) => name(p.userId)).join(", ");
  const against = bet.participants.filter((p) => p.side === "against").map((p) => name(p.userId)).join(", ");
  const pending = bet.participants.filter((p) => p.required && !p.acceptedAt).map((p) => name(p.userId));
  return [
    `🎯 bet #${bet.id.slice(0, 6)}`,
    `${name(bet.creatorId)} says: "${bet.claim}"`,
    `stake: ${stakeLine(bet)}${bet.funding ? ` · ${name(bet.funding.holderUserId)} holds the pot` : ""}`,
    `${forSide || "—"} vs ${against || "anyone who 👍"}`,
    `by ${when(bet.deadlineAt)}`,
    `proof: ${bet.proofCriteria.summary}`,
    `judge: ${bet.judgeKind === "referee" && bet.refereeUserId ? name(bet.refereeUserId) : "me"}`,
    pending.length ? `👍 to lock it in — waiting on ${pending.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function postText(kind: PostKind, bet: Bet, name: Names): string {
  const short = `#${bet.id.slice(0, 6)}`;
  const forNames = bet.participants.filter((p) => p.side === "for").map((p) => name(p.userId)).join(", ");
  switch (kind) {
    case "accepted_partial":
      return betCard(bet, name);
    case "locked":
      return [
        `🔒 LOCKED ${short} — ${stakeLine(bet)} on the line`,
        `proof by ${when(bet.deadlineAt)} (${bet.proofGraceHours}h grace, then it's an L)`,
        bet.challengeToken && bet.proofCriteria.challengeTokenRequired
          ? `get the word "${bet.challengeToken}" in the shot — paper, screen, whatever`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "declined":
      return `❌ ${short} declined — nothing on the line`;
    case "cancelled":
      return `🗑 ${short} scrapped by ${name(bet.creatorId)}.`;
    case "expired":
      return `⌛ ${short} died — not everyone 👍'd in 24h`;
    case "proof_received":
      return bet.judgeKind === "referee" && bet.refereeUserId
        ? `📸 proof's in for ${short}. ${name(bet.refereeUserId)} you're the ref — "call ${short} yes" if it counts, "call ${short} no" if not`
        : `📸 proof's in for ${short} — gimme a sec`;
    case "need_better_proof":
      return `🤔 couldn't call ${short} off that — need a cleaner shot: ${bet.proofCriteria.required.join(", ")}`;
    case "verdict": {
      const v = bet.verdict!;
      const winner = v.outcome === "for" ? forNames : bet.participants.filter((p) => p.side === "against").map((p) => name(p.userId)).join(", ");
      return [
        `⚖️ VERDICT ${short}: ${v.outcome === "for" ? "claim stands" : "claim fails"} (${Math.round(v.confidence * 100)}% sure). ${winner} takes the W`,
        `think i got it wrong? "dispute ${short}" within 24h (puts up ${bondText(bet)})`,
      ].join("\n");
    }
    case "auto_loss":
      return `⏰ ${short}: no proof, time's up — ${forNames} takes the L, 24h to dispute`;
    case "voided":
      return `↩️ ${short} voided — everyone gets their points back`;
    case "disputed":
      return bet.judgeKind === "referee" && bet.refereeUserId
        ? `🚩 ${name(bet.dispute?.disputerId ?? "")} disputed ${short}${bet.dispute?.reason ? ` ("${bet.dispute.reason}")` : ""} — bond's up\n${name(bet.refereeUserId)} final call: "call ${short} yes" or "call ${short} no" — 48h or it voids`
        : `🚩 ${name(bet.dispute?.disputerId ?? "")} disputed ${short}${bet.dispute?.reason ? ` ("${bet.dispute.reason}")` : ""} — bond's up, taking a second look`;
    case "settled": {
      const v = bet.verdict!;
      const winners = bet.participants.filter((p) => p.side === v.outcome).map((p) => name(p.userId)).join(", ");
      return `💸 SETTLED ${short}: ${winners} got paid — gg`;
    }
    case "judge_failed":
      return `⚠️ ${short}: judging broke — resend the proof or ping a human`;
  }
}

function bondText(bet: Bet): string {
  if (bet.stake.kind === "social") return "1 pt";
  const half = bet.stake.amount / 2n;
  return `${half > 0n ? half : 1n} pts`;
}
