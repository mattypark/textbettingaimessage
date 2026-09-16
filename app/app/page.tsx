import Link from "next/link";
import type { Metadata } from "next";
import { TERMS_VERSION } from "@/src/onboarding/terms";
import { webData } from "@/src/web/data";
import type { BetListItem } from "@/src/web/data/types";
import { TERMINAL } from "@/src/web/format";
import { portfolioMood } from "@/src/web/status-theme";
import { Mascot } from "@/app/(site)/folk/mascot";
import { GlassBall } from "@/app/(site)/folk/stickers";
import { AcceptTerms } from "./accept-terms";
import { InvitePanel } from "./invite-panel";
import { BetRow } from "./_ui/bet-row";
import { BetTabs } from "./_ui/bet-tabs";
import { EmptyState } from "./_ui/empty-state";
import { StatPill } from "./_ui/stat-pill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your bets", robots: { index: false, follow: false } };

const BOT_NUMBER = process.env.NEXT_PUBLIC_BOT_NUMBER ?? "+12053968556";

export default async function AppHome() {
  const { viewer, data } = await webData();
  const [wallet, bets, invite, chats] = await Promise.all([data.wallet(), data.bets(), data.invite(), data.chats()]);
  const open = bets.filter((b) => !TERMINAL.has(b.bet.status));
  const settled = bets.filter((b) => TERMINAL.has(b.bet.status));
  const needsTerms = viewer.live && (wallet?.termsVersionAccepted ?? 0) < TERMS_VERSION;
  const mood = portfolioMood(bets.map((b) => b.bet), viewer.userId);
  const textBot = { href: `sms:${BOT_NUMBER}&body=${encodeURIComponent("bookie ")}`, label: "text bookie a bet" };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 sm:px-8">
      <section className="flex items-end gap-4">
        <GlassBall size={92} className="shrink-0">
          <Mascot mood={mood} size={66} />
        </GlassBall>
        <div className="min-w-0 pb-2">
          <p className="text-[13px] font-medium text-sky-ink/60">{greeting(open.length, mood)}</p>
          <h1 className="truncate text-[34px] font-bold leading-none">hey {viewer.name.toLowerCase()}</h1>
        </div>
      </section>

      {needsTerms && <AcceptTerms version={TERMS_VERSION} live={viewer.live} />}

      <section className="mt-6 flex flex-wrap gap-3" aria-label="wallet">
        <StatPill label="available" value={`${wallet?.available ?? 0n}`} unit="pts" accent />
        <StatPill label="in play" value={`${wallet?.held ?? 0n}`} unit="pts" />
        <StatPill label="honor" value={`${wallet?.honorScore ?? 100}`} />
      </section>

      {chats.length > 0 && (
        <section className="mt-6" aria-label="your chats">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-ink/55">leaderboards</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {chats.map((c) => (
              <li key={c.id}>
                <Link href={`/app/chats/${c.id}`} className="flex min-h-11 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-sky-ink shadow-sm transition-transform hover:-translate-y-0.5">
                  {c.name ?? "group"} <span className="ml-1.5 text-sky-ink/40">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BetTabs
        openCount={open.length}
        settledCount={settled.length}
        open={<BetList items={open} viewerId={viewer.userId} empty={<EmptyState mood="sleep" title="nothing open" body="bets start in the group chat. say its name and what you're betting." cta={textBot} />} />}
        settled={<BetList items={settled} viewerId={viewer.userId} empty={<EmptyState mood="zen" title="no history yet" body="settled bets land here with the verdict." />} />}
      />

      {invite && <InvitePanel code={invite.code} uses={invite.uses} maxUses={invite.maxUses} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />}
    </main>
  );
}

function greeting(openCount: number, mood: string): string {
  if (mood === "ref") return "something's being judged.";
  if (mood === "money") return "you won this week. act normal.";
  if (openCount === 0) return "quiet in here.";
  return `${openCount} ${openCount === 1 ? "bet" : "bets"} in play.`;
}

function BetList({ items, viewerId, empty }: { items: BetListItem[]; viewerId: string; empty: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ bet, chatName }) => (
        <BetRow key={bet.id} bet={bet} chatName={chatName} viewerId={viewerId} />
      ))}
    </ul>
  );
}
