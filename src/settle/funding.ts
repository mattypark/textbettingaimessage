import type { Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
import { displayName } from "@/src/agent/context";
import { PAY_PROVIDERS, PROVIDER_LABEL, payLink, type PayHandles } from "./pay-links";

/**
 * Holder-funded stakes. A friend in the chat (not in the bet) holds the
 * pot: every bettor pays them up front through their own app, the holder
 * says "got it", and after the verdict the holder pays the winner. Mushy
 * posts the links and keeps the tally; money never passes through it.
 */
export interface FundingTextInput {
  bet: Bet;
  name: (userId: string) => string;
  handlesOf: (userId: string) => Promise<PayHandles>;
}

function linksFor(handles: PayHandles, amount: number, note: string): string[] {
  return PAY_PROVIDERS.filter((p) => handles[p]).map((p) => {
    const link = payLink(p, handles[p]!, amount, note);
    return link ? `${PROVIDER_LABEL[p]}: ${link}` : `${PROVIDER_LABEL[p]}: send it in this thread to ${handles[p]}`;
  });
}

/** Posted right after LOCKED. */
export async function fundingRequestText({ bet, name, handlesOf }: FundingTextInput): Promise<string | null> {
  const f = bet.funding;
  if (!f) return null;
  const short = `#${bet.id.slice(0, 6)}`;
  const bettors = bet.participants.filter((p) => p.userId !== f.holderUserId);
  const pot = f.amountUsd * bettors.length;
  const holder = name(f.holderUserId);
  const links = linksFor(await handlesOf(f.holderUserId), f.amountUsd, `mushy ${short} pot`);
  return [
    `💵 ${short} is $${f.amountUsd} each, $${pot} pot — ${holder}'s holding it`,
    `${bettors.map((p) => name(p.userId)).join(" + ")} → send ${holder} $${f.amountUsd}${links.length ? ":" : " (" + holder + ", drop your venmo/cash app with !pay so i can link it)"}`,
    ...links,
    `say "paid" when it's sent, ${holder} says "got it" when the pot's full`,
  ].join("\n");
}

/** Tally line after someone says "paid" / holder says "got it". */
export function fundingStatusText(bet: Bet, name: (userId: string) => string): string {
  const f = bet.funding;
  if (!f) return "";
  const bettors = bet.participants.filter((p) => p.userId !== f.holderUserId);
  const paid = bettors.filter((p) => f.paid[p.userId]);
  const missing = bettors.filter((p) => !f.paid[p.userId]);
  if (f.confirmedAt) return `💰 pot's full — $${f.amountUsd * bettors.length} with ${name(f.holderUserId)}, proof time`;
  return `${paid.map((p) => name(p.userId)).join(", ") || "nobody"} paid (${paid.length}/${bettors.length})${missing.length ? ` — waiting on ${missing.map((p) => name(p.userId)).join(", ")}` : ` — ${name(f.holderUserId)} say "got it"`}`;
}

/** After SETTLED on a funded bet: the holder pays the winner the pot. */
export async function fundingPayoutText({ bet, name, handlesOf }: FundingTextInput): Promise<string | null> {
  const f = bet.funding;
  if (!f || !bet.verdict) return null;
  const short = `#${bet.id.slice(0, 6)}`;
  const bettors = bet.participants.filter((p) => p.userId !== f.holderUserId);
  const winners = bettors.filter((p) => p.side === bet.verdict!.outcome);
  if (!winners.length) return null;
  const pot = f.amountUsd * bettors.length;
  const each = Math.floor((pot / winners.length) * 100) / 100;
  const lines = [`🤝 ${name(f.holderUserId)}, pay it out — $${pot} pot:`];
  for (const w of winners) {
    const links = linksFor(await handlesOf(w.userId), each, `mushy ${short} W`);
    lines.push(`→ ${name(w.userId)} $${each}${links.length ? "\n" + links.join("\n") : ` (${name(w.userId)} drop a !pay handle for a link)`}`);
  }
  return lines.join("\n");
}

export function fundingHooks(store: Store) {
  const deps = async (bet: Bet) => {
    const members = await store.chatMembers(bet.chatId);
    return {
      bet,
      name: (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id }),
      handlesOf: async (id: string) => (await store.payHandles(id)) as PayHandles,
    };
  };
  return {
    fundingRequest: async (bet: Bet) => fundingRequestText(await deps(bet)),
    fundingPayout: async (bet: Bet) => fundingPayoutText(await deps(bet)),
  };
}
