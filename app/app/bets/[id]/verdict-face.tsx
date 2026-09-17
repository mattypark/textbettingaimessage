import type { Bet } from "@/src/bets/types";
import type { VerdictView } from "@/src/web/data/types";
import { dueIn, when } from "@/src/web/format";
import { Mascot } from "@/app/(site)/folk/mascot";
import { LocalTime } from "../../_ui/local-time";

const WORD: Record<VerdictView["outcome"], { text: string; fill: string; ring: string }> = {
  for: { text: "claim stands", fill: "#3ccf63", ring: "text-sticker-green" },
  against: { text: "claim fails", fill: "#f0576d", ring: "text-sticker-red" },
  inconclusive: { text: "inconclusive", fill: "#f7d94a", ring: "text-sticker-yellow" },
};

/** Back of the card: the call, how sure the judge was, and why. */
export function VerdictFace({ bet, verdict }: { bet: Bet; verdict?: VerdictView }) {
  if (!verdict) {
    return (
      <article className="card-soft flex flex-col items-center justify-center p-8 text-center sm:p-12">
        <Mascot mood="zen" size={120} />
        <p className="mt-4 text-[20px] font-bold">no verdict yet</p>
        <p className="mt-1 max-w-xs text-[14px] text-sky-ink/70">
          {bet.status === "proposed" ? "the bet has to lock first." : bet.status === "locked" ? "waiting on proof in the thread." : "mushy is looking at the proof."}
        </p>
      </article>
    );
  }

  const word = WORD[verdict.outcome];
  const pct = Math.round(verdict.confidence * 100);
  const disputeOpen = bet.status === "verdict_posted" && bet.disputeWindowEndsAt;

  return (
    <article className="card-soft p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <svg viewBox="0 0 320 90" className="h-auto w-[240px] max-w-full sm:w-[280px]" role="img" aria-label={word.text}>
          <text x="8" y="66" fontSize="54" fontWeight="900" fill={word.fill} fontFamily="var(--font-round)" stroke="#fff" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke" letterSpacing="-2">
            {word.text}
          </text>
        </svg>
        <ConfidenceRing pct={pct} className={word.ring} />
      </div>

      <ul className="mt-5 space-y-2.5">
        {verdict.checks.map((c) => (
          <li key={c.criterion} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${c.met ? "bg-sticker-green" : "bg-sticker-red"}`} aria-label={c.met ? "met" : "not met"}>
              {c.met ? "✓" : "✕"}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold">{c.criterion}</span>
              <span className="block text-[13px] text-sky-ink/70">{c.evidence}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 rounded-[18px] bg-sky-ink/5 p-4 text-[14px] leading-relaxed text-sky-ink/80">{verdict.reasoning}</p>

      <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-sky-ink/70">
        <span>
          pass {verdict.pass} · <LocalTime iso={verdict.createdAt} initial={when(verdict.createdAt)} />
        </span>
        {disputeOpen && <span className="font-semibold text-sticker-red">dispute window {dueIn(bet.disputeWindowEndsAt!).replace("due", "closes")}</span>}
        {bet.status === "disputed" && bet.dispute && <span className="font-semibold text-sticker-red">disputed: {bet.dispute.reason ?? "no reason given"}</span>}
      </p>
    </article>
  );
}

function ConfidenceRing({ pct, className }: { pct: number; className: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 72 72" className={`h-[72px] w-[72px] ${className}`} role="img" aria-label={`${pct}% confidence`}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="8" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 36 36)" />
        <text x="36" y="41" textAnchor="middle" fontSize="16" fontWeight="800" fill="#1f2a2f" fontFamily="var(--font-round)">
          {pct}
        </text>
      </svg>
      <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-ink/70">
        %<br />sure
      </span>
    </div>
  );
}
