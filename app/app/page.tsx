import Link from "next/link";
import { redirect } from "next/navigation";
import { linkAuthUser } from "@/src/auth/link-user";
import { supabaseServer } from "@/src/db/server";
import { TERMS_VERSION } from "@/src/onboarding/terms";
import { STATUS_LABEL, TERMINAL, shortId, stakeText, when } from "@/src/web/format";
import { myBets, myWallet } from "@/src/web/queries";
import { AcceptTerms } from "./accept-terms";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.phone) redirect("/app/sign-in");
  await linkAuthUser(auth.user.id, `+${auth.user.phone.replace(/^\+/, "")}`);

  const [wallet, bets] = await Promise.all([myWallet(supabase), myBets(supabase)]);
  const open = bets.filter((b) => !TERMINAL.has(b.bet.status));
  const done = bets.filter((b) => TERMINAL.has(b.bet.status));
  const needsTerms = (wallet?.termsVersionAccepted ?? 0) < TERMS_VERSION;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24">
      {needsTerms && <AcceptTerms version={TERMS_VERSION} />}

      <section className="slip mt-6 grid grid-cols-3 divide-x divide-rule px-2 py-6 text-center">
        <Stat label="available" value={`${wallet?.available ?? 0n}`} unit="pts" />
        <Stat label="in play" value={`${wallet?.held ?? 0n}`} unit="pts" />
        <Stat label="honor" value={`${wallet?.honorScore ?? 100}`} />
      </section>

      <BetList title="Open" items={open} empty="Nothing open. Text the bot a bet." />
      <BetList title="Settled" items={done} empty="No history yet." />
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="num mt-1 text-3xl">
        {value}
        {unit && <span className="ml-1 text-sm text-ink-soft">{unit}</span>}
      </p>
    </div>
  );
}

function BetList({ title, items, empty }: { title: string; items: Awaited<ReturnType<typeof myBets>>; empty: string }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">{title}</h2>
      {items.length === 0 ? (
        <p className="rule mt-3 pt-4 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="rule mt-3">
          {items.map(({ bet, chatName }) => (
            <li key={bet.id} className="border-b border-rule">
              <Link href={`/app/bets/${bet.id}`} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 py-4 hover:bg-paper-deep/60">
                <span className="num text-xs text-ink-soft">{shortId(bet.id)}</span>
                <span className="min-w-0">
                  <span className="block truncate">{bet.claim}</span>
                  <span className="block text-xs text-ink-soft">{chatName ?? "group"} · {STATUS_LABEL[bet.status]} · due {when(bet.deadlineAt)}</span>
                </span>
                <span className="num text-right text-sm">{stakeText(bet)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
