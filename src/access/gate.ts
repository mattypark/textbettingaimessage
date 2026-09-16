import type { AccessStore } from "./store";

export interface GateDecision {
  allowed: boolean;
  /** One-time reply for people who aren't in yet. */
  reply?: string;
}

/**
 * Invite-only. The bot ignores phones that haven't been activated, apart
 * from one nudge per chat pointing at the waitlist — and a way in for
 * someone who was handed a code in person ("code ABCD1234").
 */
export function accessGate(store: AccessStore, siteUrl: string) {
  const nudged = new Set<string>();
  const site = siteUrl.replace(/\/$/, "");

  return async (chatId: string, userId: string, phone: string, text: string): Promise<GateDecision> => {
    if ((await store.access(userId)) === "active") return { allowed: true };

    const code = text.match(/\bcode\s+([A-Za-z0-9]{6,12})\b/i)?.[1];
    if (code) {
      try {
        const own = await store.redeemInvite(code, phone);
        return { allowed: true, reply: `you're in. your own invite link (3 uses): ${site}/join?ref=${own}` };
      } catch {
        return { allowed: false, reply: `that code didn't work. get on the list at ${site}/join` };
      }
    }

    const key = `${chatId}:${userId}`;
    if (nudged.has(key)) return { allowed: false };
    nudged.add(key);
    return { allowed: false, reply: `bookie is invite-only right now. grab a spot at ${site}/join — or reply "code XXXXXXXX" if a friend gave you one.` };
  };
}
