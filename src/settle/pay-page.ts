import { displayName } from "@/src/agent/context";
import type { Bet } from "@/src/bets/types";
import { tickDeps } from "@/src/inbound";
import { fundingStatusText } from "./funding";
import { dollarAmount, PAY_PROVIDERS, payLink, type PayHandles, type PayProvider } from "./pay-links";

export type PayPhase = "collect" | "payout" | "done";

export interface PayPageRow {
  userId: string;
  from: string;
  to: string;
  done: boolean;
}

export interface PayPage {
  betId: string;
  phase: PayPhase;
  amountLabel: string;
  claim: string;
  /** Who receives right now: the holder while collecting, the winner at payout. */
  payeeName: string;
  rows: PayPageRow[];
  links: Array<{ provider: PayProvider; url: string | null }>;
  openPayers: Array<{ userId: string; name: string }>;
}

/**
 * Everything the /pay/<bet> sheet shows, straight from the bet document.
 * Server-only (service role); the bet id is the only key, and it is a uuid.
 */
export async function loadPayPage(betId: string): Promise<PayPage | null> {
  if (!/^[0-9a-f-]{36}$/i.test(betId)) return null;
  const { store, betStore } = tickDeps();
  const bet = await betStore.get(betId);
  if (!bet || bet.stake.kind !== "social") return null;
  const members = await store.chatMembers(bet.chatId);
  const name = (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id });
  const handlesOf = async (id: string) => (await store.payHandles(id)) as PayHandles;

  const amount = bet.funding?.amountUsd ?? dollarAmount(bet.stake.description ?? "");
  const amountLabel = amount !== null ? `$${amount}` : (bet.stake.description ?? "stake");
  const note = `mushy #${bet.id.slice(0, 6)}`;
  const linksFor = async (id: string, amt: number | null) => {
    const handles = await handlesOf(id);
    return PAY_PROVIDERS.filter((p) => handles[p]).map((p) => ({ provider: p, url: payLink(p, handles[p]!, amt, note) }));
  };

  const f = bet.funding;
  if (f && !bet.verdict) {
    const bettors = bet.participants.filter((p) => p.userId !== f.holderUserId);
    const rows = bettors.map((p) => ({ userId: p.userId, from: name(p.userId), to: name(f.holderUserId), done: Boolean(f.paid[p.userId]) }));
    return {
      betId,
      phase: f.confirmedAt ? "done" : "collect",
      amountLabel: `$${f.amountUsd}`,
      claim: bet.claim,
      payeeName: name(f.holderUserId),
      rows,
      links: await linksFor(f.holderUserId, f.amountUsd),
      openPayers: rows.filter((r) => !r.done).map((r) => ({ userId: r.userId, name: r.from })),
    };
  }

  if (bet.verdict) {
    const winners = bet.participants.filter((p) => p.side === bet.verdict!.outcome && p.userId !== f?.holderUserId);
    const losers = bet.participants.filter((p) => p.side !== bet.verdict!.outcome && p.userId !== f?.holderUserId);
    const payer = f ? [f.holderUserId] : losers.map((p) => p.userId);
    const winner = winners[0];
    if (!winner) return null;
    const pot = f ? f.amountUsd * (winners.length + losers.length) : amount;
    return {
      betId,
      phase: bet.status === "settled" ? "payout" : "done",
      amountLabel: pot !== null ? `$${pot}` : amountLabel,
      claim: bet.claim,
      payeeName: name(winner.userId),
      rows: payer.map((id) => ({ userId: id, from: name(id), to: name(winner.userId), done: false })),
      links: await linksFor(winner.userId, pot),
      openPayers: [],
    };
  }

  return { betId, phase: "done", amountLabel, claim: bet.claim, payeeName: "", rows: [], links: [], openPayers: [] };
}

/** "I sent it" from the sheet: same effect as saying "paid" in the chat, and the chat hears about it. */
export async function markPaidFromWeb(betId: string, userId: string): Promise<boolean> {
  const { store, betStore, outbox } = tickDeps();
  const bet = await betStore.get(betId);
  const f = bet?.funding;
  if (!bet || !f || f.confirmedAt || f.holderUserId === userId || !bet.participants.some((p) => p.userId === userId)) return false;
  const funding = { ...f, paid: { ...f.paid, [userId]: new Date().toISOString() } };
  await betStore.setFunding(bet.id, funding);
  const members = await store.chatMembers(bet.chatId);
  const name = (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id });
  await outbox.send(bet.chatId, { text: fundingStatusText({ ...bet, funding } as Bet, name) }, `web-paid:${bet.id}:${userId}`);
  return true;
}
