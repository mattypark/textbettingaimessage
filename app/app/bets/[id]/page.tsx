import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { webData } from "@/src/web/data";
import { FlipCard } from "./flip-card";
import { HistoryTimeline } from "./history-timeline";
import { LiveStatus } from "./live-status";
import { ProofGrid } from "./proof-grid";
import { SlipFace } from "./slip-face";
import { VerdictFace } from "./verdict-face";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bet", robots: { index: false, follow: false } };

const SHOW_VERDICT_FIRST = new Set(["verdict_posted", "disputed", "settled"]);

export default async function BetPage({ params }: PageProps<"/app/bets/[id]">) {
  const { id } = await params;
  const { viewer, data } = await webData();
  const detail = await data.betDetail(id);
  if (!detail) notFound();
  const { bet, chatName, proofs, verdict, events, names } = detail;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 sm:px-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/app" className="flex min-h-11 items-center gap-1 text-[14px] font-semibold text-sky-ink/70 hover:text-sky-ink">
          <span aria-hidden="true">‹</span> all bets
        </Link>
        <div className="flex items-center gap-2">
          <LiveStatus betId={bet.id} live={viewer.live} />
          <Link href={`/app/chats/${bet.chatId}`} className="flex min-h-11 items-center rounded-full bg-white px-4 text-[13px] font-semibold shadow-sm">
            {chatName ?? "group"} leaderboard ›
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <FlipCard
          front={<SlipFace bet={bet} chatName={chatName} names={names} viewerId={viewer.userId} />}
          back={<VerdictFace bet={bet} verdict={verdict} />}
          hasBack={Boolean(verdict)}
          defaultFace={verdict && SHOW_VERDICT_FIRST.has(bet.status) ? "verdict" : "slip"}
        />
      </div>

      <ProofGrid proofs={proofs} />
      <HistoryTimeline events={events} />
    </main>
  );
}
