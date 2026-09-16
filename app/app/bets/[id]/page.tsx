import Link from "next/link";
import { notFound } from "next/navigation";
import { webData } from "@/src/web/data";
import { STATUS_LABEL, shortId, stakeText, when } from "@/src/web/format";

export const dynamic = "force-dynamic";

export default async function BetPage({ params }: PageProps<"/app/bets/[id]">) {
  const { id } = await params;
  const { data } = await webData();
  const detail = await data.betDetail(id);
  if (!detail) notFound();
  const { bet, proofs, verdict, events, names } = detail;
  const name = (userId: string) => names.get(userId) ?? "someone";
  const forSide = bet.participants.filter((p) => p.side === "for");
  const against = bet.participants.filter((p) => p.side === "against");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24">
      <Link href="/app" className="text-xs uppercase tracking-wider text-ink-soft hover:text-ink">← all bets</Link>

      <article className="slip mt-4 px-6 py-7">
        <div className="flex items-baseline justify-between gap-4">
          <span className="num text-xs text-ink-soft">{shortId(bet.id)}</span>
          <span className={`stamp ${bet.status === "settled" ? "text-stamp" : bet.status === "locked" ? "text-locked" : "text-ink-soft"}`}>{STATUS_LABEL[bet.status]}</span>
        </div>
        <h1 className="font-display mt-3 text-3xl leading-tight">“{bet.claim}”</h1>
        <dl className="rule mt-5 grid grid-cols-2 gap-y-3 pt-4 text-sm sm:grid-cols-4">
          <Row k="stake" v={stakeText(bet)} mono />
          <Row k="deadline" v={when(bet.deadlineAt)} />
          <Row k="for" v={forSide.map((p) => name(p.userId)).join(", ") || "—"} />
          <Row k="against" v={against.map((p) => name(p.userId)).join(", ") || "—"} />
          <Row k="judge" v={bet.judgeKind === "referee" && bet.refereeUserId ? name(bet.refereeUserId) : "the bot"} />
          <Row k="proof must show" v={bet.proofCriteria.summary} wide />
        </dl>
      </article>

      {verdict && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Verdict</h2>
          <div className="rule mt-3 pt-4 text-sm">
            <p>
              <span className="stamp text-stamp mr-3">{verdict.outcome === "for" ? "claim stands" : verdict.outcome === "against" ? "claim fails" : "inconclusive"}</span>
              <span className="num">{Math.round(Number(verdict.confidence) * 100)}%</span>
              <span className="text-ink-soft"> · pass {verdict.pass} · {when(verdict.createdAt)}</span>
            </p>
            <ul className="mt-3 space-y-1">
              {verdict.checks.map((c) => (
                <li key={c.criterion} className="grid grid-cols-[1.5rem_1fr] gap-2">
                  <span>{c.met ? "✅" : "❌"}</span>
                  <span>{c.criterion}<span className="block text-xs text-ink-soft">{c.evidence}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-ink-soft">{verdict.reasoning}</p>
          </div>
        </section>
      )}

      {proofs.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Proof</h2>
          <ul className="rule mt-3 grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3">
            {proofs.map((p) => (
              <li key={p.id} className="border border-rule bg-white p-2 text-xs">
                <a href={p.mediaUrl} target="_blank" rel="noreferrer" className="block aspect-square bg-paper-deep" aria-label={`open proof from ${p.submitterName}`}>
                  {p.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrl} alt={`proof from ${p.submitterName}`} width={400} height={400} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-ink-soft">▶ video</span>
                  )}
                </a>
                <p className="mt-2 text-ink-soft">{p.submitterName} · {when(p.receivedAt)} · {p.status.replace("_", " ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-2xl">History</h2>
        <ol className="rule mt-3 pt-2 text-sm">
          {events.map((e) => (
            <li key={e.version} className="grid grid-cols-[auto_1fr] gap-4 border-b border-rule py-2">
              <span className="num text-xs text-ink-soft">{when(e.createdAt)}</span>
              <span>{e.type.toLowerCase().replace(/_/g, " ")} → {STATUS_LABEL[e.toStatus]}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Row({ k, v, mono, wide }: { k: string; v: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-4" : ""}>
      <dt className="text-[11px] uppercase tracking-wider text-ink-soft">{k}</dt>
      <dd className={mono ? "num" : ""}>{v}</dd>
    </div>
  );
}
