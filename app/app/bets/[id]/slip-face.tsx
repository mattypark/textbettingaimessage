import type { Bet } from "@/src/bets/types";
import { stakeText, when } from "@/src/web/format";
import { statusTheme, viewerOutcome } from "@/src/web/status-theme";
import { Mascot } from "@/app/(site)/folk/mascot";
import { StickerCamera } from "@/app/(site)/folk/stickers";
import { LocalTime } from "../../_ui/local-time";
import { StatusChip } from "../../_ui/status-chip";
import { Person } from "./person";

/** Front of the card: what was bet, by whom, for how much, and what proof must show. */
export function SlipFace({ bet, chatName, names, viewerId }: { bet: Bet; chatName: string | null; names: Map<string, string>; viewerId: string }) {
  const name = (id: string) => names.get(id) ?? "someone";
  const outcome = viewerOutcome(bet, viewerId);
  const theme = statusTheme(bet.status, outcome);
  const forSide = bet.participants.filter((p) => p.side === "for");
  const against = bet.participants.filter((p) => p.side === "against");
  const judge = bet.judgeKind === "referee" && bet.refereeUserId ? name(bet.refereeUserId) : "mushy";

  return (
    <article className="card-soft relative overflow-hidden p-5 sm:p-7">
      <Mascot mood={theme.mood} size={72} className="pointer-events-none absolute right-1 top-1 sm:hidden" />
      <Mascot mood={theme.mood} size={110} className="pointer-events-none absolute right-2 top-2 hidden sm:block" />
      <div className="relative flex flex-wrap items-center gap-2 pr-20 sm:pr-28">
        <StatusChip status={bet.status} outcome={outcome} />
        <span className="text-[13px] text-sky-ink/70">{chatName ?? "group"}</span>
      </div>
      <h1 className="relative mt-4 max-w-[26ch] pr-14 text-[28px] font-bold leading-[1.08] sm:pr-24 sm:text-[36px]">&ldquo;{bet.claim}&rdquo;</h1>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Field label="stake">
          <span className="tnum text-[18px] font-bold">{stakeText(bet)}</span>
        </Field>
        <Field label="deadline">
          <LocalTime iso={bet.deadlineAt} initial={when(bet.deadlineAt)} />
        </Field>
        <Field label="for">
          <People ids={forSide.map((p) => p.userId)} pending={forSide.filter((p) => !p.acceptedAt).map((p) => p.userId)} name={name} />
        </Field>
        <Field label="against">
          <People ids={against.map((p) => p.userId)} pending={against.filter((p) => !p.acceptedAt).map((p) => p.userId)} name={name} />
        </Field>
      </dl>

      <div className="mt-6 rounded-[18px] bg-sky-ink/5 p-4">
        <div className="flex items-center gap-2">
          <StickerCamera className="h-6 w-6" />
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-ink/70">proof must show</p>
        </div>
        <p className="mt-2 text-[15px] font-medium">{bet.proofCriteria.summary}</p>
        <ul className="mt-2 space-y-1 text-[14px] text-sky-ink/70">
          {bet.proofCriteria.required.map((r) => (
            <li key={r} className="flex gap-2">
              <span aria-hidden="true">·</span>
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-sky-ink/70">
          <span>judged by {judge}</span>
          {bet.challengeToken && (
            <span className="chip bg-white text-sky-ink">
              show <span className="tnum">&ldquo;{bet.challengeToken}&rdquo;</span> in frame
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-ink/70">{label}</dt>
      <dd className="mt-1 text-[15px]">{children}</dd>
    </div>
  );
}

function People({ ids, pending, name }: { ids: string[]; pending: string[]; name: (id: string) => string }) {
  if (ids.length === 0) return <span className="text-sky-ink/70">open seat</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => (
        <Person key={id} name={name(id)} muted={pending.includes(id)} />
      ))}
    </div>
  );
}
