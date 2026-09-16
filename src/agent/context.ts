import type { BetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";
import type { MemberRow, Store } from "@/src/db/store";
import type { Ledger } from "@/src/ledger/types";
import type { TurnContext } from "@/src/inbound/pipeline";
import { BOT_TZ } from "@/src/bets/commands";

export interface ChatSnapshot {
  members: MemberRow[];
  openBets: Bet[];
  sender: MemberRow;
  wallet: { available: bigint; held: bigint };
  now: Date;
}

export function displayName(member: Pick<MemberRow, "displayName" | "phone">): string {
  return member.displayName ?? `…${member.phone.slice(-4)}`;
}

export async function snapshot(ctx: TurnContext, store: Store, betStore: BetStore, ledger: Ledger, now = new Date()): Promise<ChatSnapshot> {
  const members = await store.chatMembers(ctx.chatId);
  const sender = members.find((m) => m.id === ctx.userId) ?? { id: ctx.userId, phone: ctx.event.senderHandle, displayName: null, honorScore: 100 };
  const [openBets, wallet] = await Promise.all([betStore.openBetsInChat(ctx.chatId), ledger.wallet(ctx.userId)]);
  return { members, openBets, sender, wallet, now };
}

/** Per-turn state block. Volatile, so it lives in the user message, after the cached prefix. */
export function contextBlock(snap: ChatSnapshot): string {
  const nameOf = (id: string) => displayName(snap.members.find((m) => m.id === id) ?? { displayName: null, phone: id });
  const lines = [
    `now: ${snap.now.toLocaleString("en-US", { timeZone: BOT_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} (${BOT_TZ})`,
    `sender: ${displayName(snap.sender)} (user_id ${snap.sender.id}) — ${snap.wallet.available} pts available, ${snap.wallet.held} held, honor ${snap.sender.honorScore}`,
    `members: ${snap.members.map((m) => `${displayName(m)} (user_id ${m.id})`).join("; ") || "unknown"}`,
  ];
  if (snap.openBets.length) {
    lines.push("open bets:");
    for (const bet of snap.openBets) {
      const sides = bet.participants.map((p) => `${nameOf(p.userId)}:${p.side}${p.acceptedAt ? "✓" : "?"}`).join(", ");
      lines.push(`- ${bet.id} [${bet.status}] "${bet.claim}" stake=${bet.stake.kind === "social" ? bet.stake.description : `${bet.stake.amount} pts`} deadline=${bet.deadlineAt} sides=${sides}`);
    }
  } else {
    lines.push("open bets: none");
  }
  return lines.join("\n");
}
