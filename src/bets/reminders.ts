import type { Names } from "./card";
import { whenIn } from "./card";
import type { BetStore } from "./store";
import type { OutboundMessage } from "@/src/transport/types";

export interface ReminderDeps {
  store: BetStore;
  post: (chatId: string, message: OutboundMessage, idempotencyKey: string) => Promise<unknown>;
  namesFor: (chatId: string) => Promise<Names>;
  /** How far ahead of the deadline the nudge goes out. */
  hoursAhead?: number;
  limit?: number;
}

/**
 * Instinct-style check-in "when the window opens": one nudge per locked
 * bet a couple of hours before proof is due, to the person who owes it.
 * Idempotent by bet; never repeats.
 */
export async function runReminders(deps: ReminderDeps, now: Date): Promise<number> {
  const hours = deps.hoursAhead ?? 2;
  const before = new Date(now.getTime() + hours * 3_600_000).toISOString();
  const due = await deps.store.lockedBetsDueBefore(now.toISOString(), before, deps.limit ?? 50);
  let sent = 0;
  for (const bet of due) {
    if (bet.reminderSentAt) continue;
    const names = await deps.namesFor(bet.chatId);
    const owes = bet.participants.filter((p) => p.side === "for").map((p) => names(p.userId)).join(", ");
    const minutes = Math.round((Date.parse(bet.deadlineAt) - now.getTime()) / 60_000);
    const left = minutes >= 120 ? `~${Math.round(minutes / 60)}h` : `${minutes} min`;
    await deps.store.setReminded(bet.id, now.toISOString());
    await deps.post(bet.chatId, { text: `⏰ #${bet.id.slice(0, 6)} — proof due ${whenIn(bet.deadlineAt)} (${left} left)\n${owes} don't take the L, drop it in the thread` }, `bet:${bet.id}:remind`);
    sent += 1;
  }
  return sent;
}
