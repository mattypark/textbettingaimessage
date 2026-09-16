import type { LeaderboardRow } from "@/src/web/data/types";

/** One member line: rank, initial, name, record, honor, net points. */
export function RankRow({ row, rank }: { row: LeaderboardRow; rank: number }) {
  const net = row.netPoints;
  const netClass = net > 0n ? "text-[#14703a]" : net < 0n ? "text-sticker-red" : "text-sky-ink/70";
  const netText = net > 0n ? `+${net}` : `${net}`;
  return (
    <li className={`flex items-center gap-3 rounded-[18px] px-3 py-3 sm:gap-4 sm:px-4 ${row.isViewer ? "bg-sky-blue/10" : ""}`}>
      <span className="tnum w-6 shrink-0 text-center text-[14px] font-bold text-sky-ink/70">{rank}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-ink text-[15px] font-bold text-white" aria-hidden="true">
        {row.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">
          {row.name}
          {row.isViewer && <span className="ml-1 text-[12px] font-semibold text-sky-ink/70">(you)</span>}
        </span>
        <span className="tnum block text-[12.5px] text-sky-ink/70">
          {row.wins}–{row.losses} · honor {row.honor}
        </span>
      </span>
      <span className={`tnum shrink-0 text-[17px] font-bold ${netClass}`}>
        {netText} <span className="text-[12px] font-semibold text-sky-ink/70">pts</span>
      </span>
    </li>
  );
}
