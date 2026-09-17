import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPayPage, markPaidFromWeb } from "@/src/settle/pay-page";
import { PROVIDER_LABEL } from "@/src/settle/pay-links";

/**
 * The tap-to-pay sheet behind the card Mushy drops in the chat. Reads the
 * bet by id (unguessable), shows who pays whom, opens the payer's own app,
 * and lets them say "paid" without going back to the thread. No money moves
 * through this page.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ betId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { betId } = await params;
  const page = await loadPayPage(betId);
  if (!page) return { title: "Mushy" };
  return { title: `${page.amountLabel} on the line`, description: page.claim };
}

export default async function PayPage({ params }: Params) {
  const { betId } = await params;
  const page = await loadPayPage(betId);
  if (!page) notFound();

  async function paid(formData: FormData) {
    "use server";
    await markPaidFromWeb(betId, String(formData.get("userId") ?? ""));
  }

  return (
    <main className="sheet">
      <style>{css}</style>
      <div className="handle" aria-hidden />
      <p className="eyebrow">{page.phase === "collect" ? "put down" : page.phase === "payout" ? "pay out" : "settled"}</p>
      <h1 className="amount">{page.amountLabel}</h1>
      <p className="claim">{page.claim}</p>

      <ul className="rows">
        {page.rows.map((row) => (
          <li key={row.userId} className={row.done ? "row done" : "row"}>
            <span className="who">{row.from}</span>
            <span className="arrow" aria-hidden>→</span>
            <span className="who">{row.to}</span>
            <span className="state">{row.done ? "paid" : "open"}</span>
          </li>
        ))}
      </ul>

      {page.links.length > 0 ? (
        <div className="buttons">
          {page.links.map((l) => (
            <a key={l.provider} className="btn" href={l.url ?? "#"} aria-disabled={!l.url}>
              {l.url ? `Open ${PROVIDER_LABEL[l.provider]}` : `${PROVIDER_LABEL[l.provider]}: send in the thread`}
            </a>
          ))}
        </div>
      ) : (
        <p className="hint">{page.payeeName} hasn&apos;t shared a payment handle yet. In the chat: <code>!pay venmo @name</code></p>
      )}

      {page.phase === "collect" && page.openPayers.length > 0 && (
        <form action={paid} className="paidform">
          <label htmlFor="userId" className="eyebrow">i&apos;m…</label>
          <select id="userId" name="userId" className="select" defaultValue={page.openPayers[0]?.userId}>
            {page.openPayers.map((p) => (
              <option key={p.userId} value={p.userId}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn primary">I sent it</button>
        </form>
      )}

      <p className="fine">Mushy keeps score. Money goes friend to friend through your own apps; nothing passes through here.</p>
    </main>
  );
}

const css = `
  .sheet { max-width: 420px; margin: 0 auto; padding: 14px 22px 40px; font-family: -apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif; color: #111; background: #fff; min-height: 100dvh; }
  @media (prefers-color-scheme: dark) { .sheet { background: #111; color: #f2f2f2; } .row { border-color: #2a2a2a; } .btn { background: #1c1c1e; color: #f2f2f2; } .select { background: #1c1c1e; color: #f2f2f2; border-color: #2a2a2a; } }
  .handle { width: 36px; height: 5px; border-radius: 3px; background: #c7c7cc; margin: 0 auto 22px; }
  .eyebrow { font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #8e8e93; margin: 0 0 6px; }
  .amount { font-size: 56px; font-weight: 700; letter-spacing: -.03em; margin: 0; font-variant-numeric: tabular-nums; }
  .claim { font-size: 17px; color: #8e8e93; margin: 6px 0 22px; }
  .rows { list-style: none; padding: 0; margin: 0 0 18px; }
  .row { display: grid; grid-template-columns: 1fr auto 1fr auto; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid #e5e5ea; font-size: 17px; }
  .row:last-child { border-bottom: 1px solid #e5e5ea; }
  .row.done .state { color: #34c759; }
  .arrow { color: #8e8e93; }
  .state { font-size: 13px; font-weight: 600; text-transform: uppercase; color: #ff9f0a; }
  .buttons { display: grid; gap: 10px; margin: 0 0 18px; }
  .btn { display: block; text-align: center; padding: 14px; border-radius: 14px; background: #f2f2f7; color: #111; font-weight: 600; font-size: 17px; text-decoration: none; border: 0; }
  .btn.primary { background: #0a84ff; color: #fff; }
  .btn[aria-disabled="true"] { opacity: .55; pointer-events: none; }
  .paidform { display: grid; gap: 10px; margin: 0 0 18px; }
  .select { font-size: 17px; padding: 12px; border-radius: 12px; border: 1px solid #e5e5ea; background: #fff; }
  .hint, .fine { font-size: 13px; color: #8e8e93; }
  code { font-family: ui-monospace, SF Mono, Menlo, monospace; }
`;
