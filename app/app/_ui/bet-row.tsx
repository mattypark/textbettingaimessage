import Link from "next/link";
import type { Bet } from "@/src/bets/types";
import { dueIn, stakeText } from "@/src/web/format";
import { statusTheme, viewerOutcome } from "@/src/web/status-theme";
import { Mascot } from "@/app/(site)/folk/mascot";
import { GlassBall } from "@/app/(site)/folk/stickers";
import { StatusChip } from "./status-chip";

/** One bet in a list: glass-ball mascot, claim, chat + deadline, status, stake. */
export function BetRow({ bet, chatName, viewerId }: { bet: Bet; chatName: string | null; viewerId: string }) {
  const outcome = viewerOutcome(bet, viewerId);
  const theme = statusTheme(bet.status, outcome);
  return (
    <li>
      <Link href={`/app/bets/${bet.id}`} className="card-soft flex items-center gap-4 p-4 transition-transform duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5 active:translate-y-0 sm:p-5">
        <GlassBall size={56} className="shrink-0">
          <Mascot mood={theme.mood} size={40} />
        </GlassBall>
        <div className="min-w-0 flex-1 font-round">
          <p className="line-clamp-2 text-[16px] font-semibold leading-snug text-sky-ink">{bet.claim}</p>
          <p className="mt-1 truncate text-[13px] text-sky-ink/70">
            {chatName ?? "group"} · {dueIn(bet.deadlineAt)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={bet.status} outcome={outcome} />
            <span className="tnum text-[13px] font-semibold text-sky-ink/80">{stakeText(bet)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
