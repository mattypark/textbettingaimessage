import type { AccessStore } from "./store";

export interface GateDecision {
  allowed: boolean;
  /** One-time reply for people who aren't in yet. */
  reply?: string;
}

/**
 * Invite-only. The bot ignores phones that haven't been activated, apart
 * from one nudge per chat pointing at the waitlist — and a way in for
 * someone who was handed a code in person ("code ABCD1234"). A chat with
 * at least one activated member is open to everyone in it.
 */
export function accessGate(store: AccessStore, siteUrl: string, chatMemberIds?: (chatId: string) => Promise<string[]>) {
  const nudged = new Set<string>();
  const site = siteUrl.replace(/\/$/, "");

  return async (chatId: string, userId: string, phone: string, text: string): Promise<GateDecision> => {
    if ((await store.access(userId)) === "active") return { allowed: true };

    // One verified person unlocks the whole chat: their friends never need a code.
    if (chatMemberIds) {
      const others = (await chatMemberIds(chatId)).filter((id) => id !== userId);
      if (others.length && (await store.anyActive(others))) return { allowed: true };
    }

    const code = text.match(/\bcode\s+([A-Za-z0-9]{6,12})\b/i)?.[1];
    if (code) {
      try {
        const own = await store.redeemInvite(code, phone);
        return { allowed: true, reply: `say less, you're in — your own invite link (3 uses): ${site}/join?ref=${own}` };
      } catch {
        return { allowed: false, reply: `that code's not it — grab a spot at ${site}/join` };
      }
    }

    const key = `${chatId}:${userId}`;
    if (nudged.has(key)) return { allowed: false };
    nudged.add(key);
    return { allowed: false, reply: `mushy's invite-only rn — grab a spot at ${site}/join or reply "code XXXXXXXX" if a friend gave you one` };
  };
}
