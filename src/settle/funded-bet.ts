import type { BetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";

/**
 * Finds the funded bet a "paid" / "got it" refers to. Bettors can only mark
 * themselves; only the holder can confirm the pot. Returns a reason string
 * when there is nothing to act on.
 */
export async function fundedBetFor(store: BetStore, chatId: string, userId: string, betId: string | undefined, role: "bettor" | "holder"): Promise<Bet | string> {
  const open = (await store.openBetsInChat(chatId)).filter((b) => b.funding && !b.funding.confirmedAt && (b.status === "locked" || b.status === "proof_submitted"));
  const mine = open.filter((b) =>
    role === "holder" ? b.funding!.holderUserId === userId : b.participants.some((p) => p.userId === userId && p.userId !== b.funding!.holderUserId),
  );
  const bet = betId ? mine.find((b) => b.id === betId || b.id.startsWith(betId)) : mine.length === 1 ? mine[0] : undefined;
  if (!bet) {
    if (!mine.length) return role === "holder" ? "no funded bet is waiting on you to confirm" : "no funded bet is waiting on your stake";
    return `which one? ${mine.map((b) => `#${b.id.slice(0, 6)} "${b.claim}"`).join(" · ")}`;
  }
  return bet;
}
