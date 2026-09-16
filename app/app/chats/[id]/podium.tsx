import type { LeaderboardRow } from "@/src/web/data/types";
import { Mascot, type Mood } from "@/app/(site)/folk/mascot";
import { GlassBall } from "@/app/(site)/folk/stickers";

const PLACE: Array<{ mood: Mood; size: number; medal: string; label: string }> = [
  { mood: "cheer", size: 116, medal: "bg-sticker-yellow", label: "1st" },
  { mood: "wave", size: 96, medal: "bg-sky-ink/15", label: "2nd" },
  { mood: "zen", size: 96, medal: "bg-sticker-orange/70", label: "3rd" },
];

/** Top three in glass balls. Stacked at 375, three-up from sm with the leader in the middle. */
export function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const top = rows.slice(0, 3);
  if (top.length === 0) return null;
  // Rank order in the DOM (reads right stacked at 375); from sm the leader moves to the middle.
  const SM_ORDER = ["sm:order-2 sm:-translate-y-4", "sm:order-1", "sm:order-3"];
  return (
    <ol className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-8" aria-label="podium">
      {top.map((row, place) => {
        const p = PLACE[place];
        return (
          <li key={row.userId} className={`flex flex-col items-center text-center ${SM_ORDER[place]}`}>
            <div className="relative">
              <GlassBall size={p.size}>
                <Mascot mood={p.mood} size={p.size * 0.72} />
              </GlassBall>
              <span className={`tnum absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[12px] font-bold text-sky-ink ring-2 ring-white ${p.medal}`}>{p.label}</span>
            </div>
            <p className="mt-4 text-[17px] font-bold">
              {row.name}
              {row.isViewer && <span className="ml-1 text-[12px] font-semibold text-sky-ink/50">(you)</span>}
            </p>
            <p className="tnum text-[13px] text-sky-ink/60">
              {row.netPoints > 0n ? `+${row.netPoints}` : `${row.netPoints}`} pts · honor {row.honor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
