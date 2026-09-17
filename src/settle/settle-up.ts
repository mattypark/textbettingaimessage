import type { Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
import { displayName } from "@/src/agent/context";
import { fundingPayoutText } from "./funding";
import { settleUpText, type PayHandles } from "./pay-links";

/** Engine hook after SETTLED: holder pays the winner on a funded bet, otherwise losers pay winners directly. */
export function settleUpFor(store: Store): (bet: Bet) => Promise<string | null> {
  return async (bet) => {
    const members = await store.chatMembers(bet.chatId);
    const input = {
      bet,
      name: (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id }),
      handlesOf: async (id: string) => (await store.payHandles(id)) as PayHandles,
    };
    if (bet.funding?.confirmedAt) return fundingPayoutText(input);
    return settleUpText(input);
  };
}
