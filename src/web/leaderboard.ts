import type { Bet } from "@/src/bets/types";
import type { LeaderboardRow } from "@/src/web/data/types";

export interface Member {
  id: string;
  name: string;
  honor: number;
}

/**
 * Ranks a chat from what RLS lets a member read: the chat's bets and the
 * co-members' honor scores. Balances of other people are not readable, so
 * "points" here means net points from settled bets in this chat.
 */
export function rankChat(bets: Bet[], members: Member[], viewerId: string): LeaderboardRow[] {
  const byId = new Map<string, Member>(members.map((m) => [m.id, m]));
  const rows = new Map<string, LeaderboardRow>();

  const row = (userId: string): LeaderboardRow => {
    let r = rows.get(userId);
    if (!r) {
      const m = byId.get(userId);
      r = { userId, name: m?.name ?? "someone", honor: m?.honor ?? 100, netPoints: 0n, wins: 0, losses: 0, isViewer: userId === viewerId };
      rows.set(userId, r);
    }
    return r;
  };

  for (const bet of bets) {
    for (const p of bet.participants) row(p.userId);
    if (bet.status !== "settled" || !bet.verdict) continue;
    const stake = bet.stake.kind === "points" ? bet.stake.amount : 0n;
    for (const p of bet.participants) {
      const r = row(p.userId);
      if (p.side === bet.verdict.outcome) {
        r.wins += 1;
        r.netPoints += stake;
      } else {
        r.losses += 1;
        r.netPoints -= stake;
      }
    }
  }
  row(viewerId);

  return [...rows.values()].sort((a, b) => {
    if (a.netPoints !== b.netPoints) return a.netPoints > b.netPoints ? -1 : 1;
    if (a.honor !== b.honor) return b.honor - a.honor;
    return a.name.localeCompare(b.name);
  });
}
