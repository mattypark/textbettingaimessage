import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { webData } from "@/src/web/data";
import { EmptyState } from "../../_ui/empty-state";
import { Podium } from "./podium";
import { RankRow } from "./rank-row";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard", robots: { index: false, follow: false } };

export default async function ChatPage({ params }: PageProps<"/app/chats/[id]">) {
  const { id } = await params;
  const { data } = await webData();
  const board = await data.leaderboard(id);
  if (!board) notFound();
  const { chat, rows } = board;
  const settledSomething = rows.some((r) => r.wins + r.losses > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-24 sm:px-8">
      <Link href="/app" className="flex min-h-11 items-center gap-1 text-[14px] font-semibold text-sky-ink/70 hover:text-sky-ink">
        <span aria-hidden="true">‹</span> all bets
      </Link>

      <section className="card-soft mt-4 px-5 pb-8 pt-7 sm:px-8">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-ink/70">leaderboard</p>
        <h1 className="mt-1 text-center text-[30px] font-bold leading-tight sm:text-[36px]">{chat.name ?? "group"}</h1>
        <p className="tnum mt-1 text-center text-[14px] text-sky-ink/70">
          {rows.length} {rows.length === 1 ? "member" : "members"}
        </p>
        <div className="mt-8">
          <Podium rows={rows} />
        </div>
      </section>

      {settledSomething ? (
        <section className="card-soft mt-4 p-2 sm:p-3" aria-label="standings">
          <ol className="flex flex-col">
            {rows.map((row, i) => (
              <RankRow key={row.userId} row={row} rank={i + 1} />
            ))}
          </ol>
        </section>
      ) : (
        <div className="mt-4">
          <EmptyState mood="sleep" title="nothing settled yet" body="the board fills in as bets in this chat get called." />
        </div>
      )}

      <p className="mt-4 px-2 text-center text-[12.5px] text-sky-ink/70">honor is public in the chat. points here are net from bets settled in this chat.</p>
    </main>
  );
}
