import type { Bet } from "@/src/bets/types";

/**
 * Settle-up links. Mushy never touches money: when a bet with a social
 * stake settles, the loser gets a link that opens their own payment app
 * pointed at the winner. Points stakes never get a link (see CLAUDE.md).
 * Apple Cash has no URL scheme, so it is an instruction, not a link.
 */
export const PAY_PROVIDERS = ["venmo", "cashapp", "paypal", "applecash"] as const;
export type PayProvider = (typeof PAY_PROVIDERS)[number];
export type PayHandles = Partial<Record<PayProvider, string>>;

const PROVIDER_ALIASES: Record<string, PayProvider> = {
  venmo: "venmo",
  cashapp: "cashapp",
  "cash app": "cashapp",
  "cash-app": "cashapp",
  paypal: "paypal",
  applecash: "applecash",
  "apple cash": "applecash",
  "apple-cash": "applecash",
};

export const PROVIDER_LABEL: Record<PayProvider, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  paypal: "PayPal",
  applecash: "Apple Cash",
};

/** "!pay venmo @matt", "my cash app is $matt", "venmo: matt-park" → provider + clean handle. */
export function parsePayHandle(text: string): { provider: PayProvider; handle: string } | null {
  const m = text.trim().match(/^(?:(!pay)\s+|my\s+)?(venmo|cash ?-?app|paypal|apple ?-?cash)\s*(is|:|=)?\s*([@$]?\+?[A-Za-z0-9._-]{2,40})\s*$/i);
  if (!m) return null;
  // "venmo me" is chatter; a handle needs !pay, a connector ("is", ":"), or an @/$ sigil.
  const explicit = Boolean(m[1]) || Boolean(m[3]) || /^[@$]/.test(m[4]);
  if (!explicit) return null;
  const provider = PROVIDER_ALIASES[m[2].toLowerCase().replace(/\s+/g, " ")];
  if (!provider) return null;
  const handle = m[4].replace(/^[@$]/, "");
  if (handle.startsWith("+") && !/^\+\d{7,15}$/.test(handle)) return null;
  return { provider, handle };
}

/** Dollar amount named in a social stake ("$20", "20 bucks", "twenty dollars" is not parsed). */
export function dollarAmount(description: string): number | null {
  const m = description.match(/\$\s?(\d{1,5}(?:\.\d{1,2})?)|(\d{1,5}(?:\.\d{1,2})?)\s?(?:bucks|dollars|usd)\b/i);
  if (!m) return null;
  const value = Number(m[1] ?? m[2]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Deep link that opens the winner's page in the loser's app with the amount and note prefilled. */
export function payLink(provider: PayProvider, handle: string, amount: number | null, note: string): string | null {
  const amt = amount !== null ? amount.toFixed(amount % 1 === 0 ? 0 : 2) : "";
  const n = encodeURIComponent(note.slice(0, 80));
  switch (provider) {
    case "venmo":
      return `https://venmo.com/${encodeURIComponent(handle)}?txn=pay${amt ? `&amount=${amt}` : ""}&note=${n}`;
    case "cashapp":
      return `https://cash.app/$${encodeURIComponent(handle)}${amt ? `/${amt}` : ""}`;
    case "paypal":
      return `https://paypal.me/${encodeURIComponent(handle)}${amt ? `/${amt}` : ""}`;
    case "applecash":
      return null;
  }
}

export interface SettleUpInput {
  bet: Bet;
  name: (userId: string) => string;
  handlesOf: (userId: string) => Promise<PayHandles>;
}

/**
 * The line posted after SETTLED for a social stake. Null for points stakes,
 * for bets with no verdict, and when nobody has a handle on file.
 */
export async function settleUpText({ bet, name, handlesOf }: SettleUpInput): Promise<string | null> {
  if (bet.stake.kind !== "social" || !bet.verdict) return null;
  const winners = bet.participants.filter((p) => p.side === bet.verdict!.outcome);
  const losers = bet.participants.filter((p) => p.side !== bet.verdict!.outcome);
  if (!winners.length || !losers.length) return null;

  const stake = bet.stake.description ?? "the stake";
  const amount = dollarAmount(stake);
  const short = `#${bet.id.slice(0, 6)}`;
  const lines: string[] = [];

  for (const winner of winners) {
    const handles = await handlesOf(winner.userId);
    const entries = PAY_PROVIDERS.filter((p) => handles[p]);
    if (!entries.length) continue;
    const note = `mushy ${short}: ${bet.claim}`.slice(0, 80);
    const links = entries.map((p) => {
      const link = payLink(p, handles[p]!, amount, note);
      return link ? `${PROVIDER_LABEL[p]}: ${link}` : `${PROVIDER_LABEL[p]}: send it in this thread to ${handles[p]}`;
    });
    const owed = amount !== null ? `$${amount}` : stake;
    lines.push(`${losers.map((l) => name(l.userId)).join(", ")} → ${name(winner.userId)} (${owed})\n${links.join("\n")}`);
  }
  if (!lines.length) return null;
  return [`🤝 settle up ${short}. i keep score, you pay each other:`, ...lines].join("\n");
}
