import type { Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
import { displayName } from "@/src/agent/context";
import type { OutboundMessage } from "@/src/transport/types";
import { fundingPayoutText } from "./funding";
import { settleUpText, type PayHandles } from "./pay-links";

/** Links only help when a phone can open them: https and not localhost. */
export function isPublicSite(siteUrl: string): boolean {
  return /^https:\/\//.test(siteUrl) && !/localhost|127\.0\.0\.1/.test(siteUrl);
}

/** The tap-to-pay page is only worth linking when the site is reachable from a phone. */
export function payPageLink(siteUrl: string, betId: string): string | null {
  return isPublicSite(siteUrl) ? `${siteUrl.replace(/\/$/, "")}/pay/${betId}` : null;
}

/** Engine hook after SETTLED: holder pays the winner on a funded bet, otherwise losers pay winners directly. Text first, then the card. */
export function settleUpFor(store: Store, siteUrl: string): (bet: Bet) => Promise<Array<string | OutboundMessage>> {
  return async (bet) => {
    const members = await store.chatMembers(bet.chatId);
    const input = {
      bet,
      name: (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id }),
      handlesOf: async (id: string) => (await store.payHandles(id)) as PayHandles,
    };
    const text = bet.funding?.confirmedAt ? await fundingPayoutText(input) : await settleUpText(input);
    if (!text) return [];
    const link = payPageLink(siteUrl, bet.id);
    return link ? [text, { text: link, link }] : [text];
  };
}
