import { displayName } from "@/src/agent/context";
import type { Names } from "@/src/bets/card";
import type { Store } from "./store";

/** Per-chat name resolver for cards and posts: display name, else the phone tail, never a raw id. */
export function namesFor(store: Store): (chatId: string) => Promise<Names> {
  return async (chatId) => {
    const members = await store.chatMembers(chatId);
    return (userId) => {
      const member = members.find((m) => m.id === userId);
      return member ? displayName(member) : `…${userId.slice(-4)}`;
    };
  };
}
