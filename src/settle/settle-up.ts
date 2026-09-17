import type { Bet } from "@/src/bets/types";
import type { Store } from "@/src/db/store";
import { displayName } from "@/src/agent/context";
import { settleUpText, type PayHandles } from "./pay-links";

/** Engine hook: names from the chat's members, handles from the store. */
export function settleUpFor(store: Store): (bet: Bet) => Promise<string | null> {
  return async (bet) => {
    const members = await store.chatMembers(bet.chatId);
    const name = (id: string) => displayName(members.find((m) => m.id === id) ?? { displayName: null, phone: id });
    return settleUpText({ bet, name, handlesOf: async (id) => (await store.payHandles(id)) as PayHandles });
  };
}
