import { randomUUID } from "node:crypto";
import type { BetEngine } from "./engine";
import { IllegalTransition } from "./state-machine";
import type { BetStore } from "./store";
import type { Bet } from "./types";

/**
 * Human decision paths shared by the agent tools and the !commands:
 * disputing a verdict, and a referee calling a bet.
 */
export type DecisionResult = { ok: true; text: string } | { ok: false; text: string };

function explain(error: unknown): string {
  if (error instanceof IllegalTransition) return error.message.replace(/^cannot \w+ from \w+: ?/, "");
  return error instanceof Error ? error.message : String(error);
}

export async function disputeBet(store: BetStore, engine: BetEngine, betId: string, userId: string, reason?: string): Promise<DecisionResult> {
  const bet = await store.get(betId);
  if (!bet) return { ok: false, text: "no such bet" };
  if (bet.status !== "verdict_posted") return { ok: false, text: `#${bet.id.slice(0, 6)} isn't awaiting a dispute (status: ${bet.status})` };
  try {
    await engine.apply(bet.id, { type: "DISPUTE", userId, disputeId: randomUUID(), reason });
    return { ok: true, text: "dispute opened, bond held (a message was posted)" };
  } catch (error) {
    return { ok: false, text: explain(error) };
  }
}

export async function refereeDecide(store: BetStore, engine: BetEngine, betId: string, userId: string, claimStands: boolean): Promise<DecisionResult> {
  const bet = await store.get(betId);
  if (!bet) return { ok: false, text: "no such bet" };
  if (bet.judgeKind !== "referee" || bet.refereeUserId !== userId) return { ok: false, text: "only the named referee can call this bet" };
  const outcome: "for" | "against" = claimStands ? "for" : "against";
  try {
    if (bet.status === "proof_submitted") await engine.apply(bet.id, { type: "JUDGE_START" });
    const current = (await store.get(bet.id)) as Bet;
    if (current.status === "judging") {
      await engine.apply(bet.id, { type: "VERDICT", outcome, confidence: 1, proofId: current.latestProofId ?? "referee" });
      return { ok: true, text: `called it: claim ${claimStands ? "stands" : "fails"}. 24h to dispute` };
    }
    if (current.status === "disputed" && current.dispute) {
      const result = outcome === current.dispute.challenged ? "upheld" : "overturned";
      await engine.apply(bet.id, { type: "DISPUTE_DECISION", result, decidedBy: "referee" });
      return { ok: true, text: `final answer: original call ${result}. settled` };
    }
    return { ok: false, text: `#${bet.id.slice(0, 6)} isn't waiting on a call (status: ${current.status})` };
  } catch (error) {
    return { ok: false, text: explain(error) };
  }
}

/** Resolve "#abc123" / "abc123" prefixes against the chat's open bets. */
export async function findBetByPrefix(store: BetStore, chatId: string, prefix: string): Promise<Bet | null> {
  const open = await store.openBetsInChat(chatId);
  return open.find((b) => b.id.startsWith(prefix.replace(/^#/, "").toLowerCase())) ?? null;
}
