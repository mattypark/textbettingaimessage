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

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function betCard(bet: Bet, name: Names): string {
  const forSide = bet.participants.filter((p) => p.side === "for").map((p) => name(p.userId)).join(", ");
  const against = bet.participants.filter((p) => p.side === "against").map((p) => name(p.userId)).join(", ");
  const pending = bet.participants.filter((p) => p.required && !p.acceptedAt).map((p) => name(p.userId));
  return [
    `🎯 BET #${bet.id.slice(0, 6)}`,
    `${name(bet.creatorId)}: "${bet.claim}"`,
    `Stake: ${stakeLine(bet)}`,
    `For: ${forSide || "—"} · Against: ${against || "—"}`,
    `Deadline: ${when(bet.deadlineAt)}`,
    `Proof: ${bet.proofCriteria.summary}`,
    `Judge: ${bet.judgeKind === "referee" && bet.refereeUserId ? name(bet.refereeUserId) : "the bot"}`,
    pending.length ? `👍 this to lock — waiting on ${pending.join(", ")}` : "",
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
        `🔒 LOCKED ${short} — ${stakeLine(bet)} held.`,
        `Proof due ${when(bet.deadlineAt)} (+${bet.proofGraceHours}h grace).`,
        bet.challengeToken && bet.proofCriteria.challengeTokenRequired
          ? `Show the word "${bet.challengeToken}" in your proof (paper, screen, anything).`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "declined":
      return `❌ ${short} declined. Nothing held.`;
    case "cancelled":
      return `🗑 ${short} cancelled by ${name(bet.creatorId)}.`;
    case "expired":
      return `⌛ ${short} expired — not everyone accepted in 24h.`;
    case "proof_received":
      return bet.judgeKind === "referee" && bet.refereeUserId
        ? `📸 Proof in for ${short}. ${name(bet.refereeUserId)}, you're the ref — reply "call ${short} yes" if the claim stands or "call ${short} no" if it fails.`
        : `📸 Proof received for ${short}. Judging…`;
    case "need_better_proof":
      return `🤔 Couldn't verify ${short} from that. Send clearer proof: ${bet.proofCriteria.required.join("; ")}.`;
    case "verdict": {
      const v = bet.verdict!;
      const winner = v.outcome === "for" ? forNames : bet.participants.filter((p) => p.side === "against").map((p) => name(p.userId)).join(", ");
      return [
        `⚖️ VERDICT ${short}: ${v.outcome === "for" ? "claim stands" : "claim fails"} (${Math.round(v.confidence * 100)}% sure). ${winner} wins.`,
        `24h to dispute — reply "dispute ${short}" (bond: ${bondText(bet)}).`,
      ].join("\n");
    }
    case "auto_loss":
      return `⏰ ${short}: deadline passed with no proof. ${forNames} loses by default. 24h to dispute.`;
    case "voided":
      return `↩️ ${short} voided — everyone refunded.`;
    case "disputed":
      return bet.judgeKind === "referee" && bet.refereeUserId
        ? `🚩 ${short} disputed by ${name(bet.dispute?.disputerId ?? "")}${bet.dispute?.reason ? ` ("${bet.dispute.reason}")` : ""}. Bond posted. ${name(bet.refereeUserId)}, final call: "call ${short} yes" or "call ${short} no". 48h or it voids.`
        : `🚩 ${short} disputed by ${name(bet.dispute?.disputerId ?? "")}${bet.dispute?.reason ? ` ("${bet.dispute.reason}")` : ""}. Bond posted. Second look in progress.`;
    case "settled": {
      const v = bet.verdict!;
      const winners = bet.participants.filter((p) => p.side === v.outcome).map((p) => name(p.userId)).join(", ");
      return `💸 SETTLED ${short}: ${winners} paid out. GG.`;
    }
    case "judge_failed":
      return `⚠️ ${short}: judging hit an error. Resend the proof or ping a human.`;
  }
}

function bondText(bet: Bet): string {
  if (bet.stake.kind === "social") return "1 pt";
  const half = bet.stake.amount / 2n;
  return `${half > 0n ? half : 1n} pts`;
}
