import type { EventView } from "@/src/web/data/types";
import { STATUS_LABEL, when } from "@/src/web/format";
import { ACCENT_DOT, statusTheme } from "@/src/web/status-theme";
import { LocalTime } from "../../_ui/local-time";

const VERB: Record<string, string> = {
  propose: "bet proposed",
  accept: "everyone tapped 👍, locked",
  proof_received: "proof landed in the thread",
  judge_start: "bookie started judging",
  verdict: "verdict posted",
  dispute: "dispute opened",
  settle: "settled, points moved",
  accept_timeout: "nobody accepted in time",
};

/** The bet's life so far, newest last, one sticker dot per state. */
export function HistoryTimeline({ events }: { events: EventView[] }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[20px] font-bold">history</h2>
      <ol className="card-soft mt-3 p-5">
        {events.map((e, i) => {
          const accent = statusTheme(e.toStatus).accent;
          const last = i === events.length - 1;
          return (
            <li key={e.version} className="relative flex gap-4 pb-5 last:pb-0">
              {!last && <span className="absolute left-[7px] top-4 h-full w-0.5 bg-sky-ink/10" aria-hidden="true" />}
              <span className={`relative mt-1 h-4 w-4 shrink-0 rounded-full ring-4 ring-white ${ACCENT_DOT[accent]}`} aria-hidden="true" />
              <div className="min-w-0 text-[14px]">
                <p className="font-semibold">{VERB[e.type] ?? e.type.toLowerCase().replace(/_/g, " ")}</p>
                <p className="text-[13px] text-sky-ink/70">
                  {STATUS_LABEL[e.toStatus]} · <LocalTime iso={e.createdAt} initial={when(e.createdAt)} />
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
