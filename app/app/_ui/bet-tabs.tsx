"use client";

import { useState, type ReactNode } from "react";

/** Open / Settled toggle. Both lists are server-rendered and passed in; this only swaps which one shows. */
export function BetTabs({ open, settled, openCount, settledCount }: { open: ReactNode; settled: ReactNode; openCount: number; settledCount: number }) {
  const [tab, setTab] = useState<"open" | "settled">("open");
  const pill = (active: boolean) =>
    `min-h-11 rounded-full px-5 text-[14px] font-semibold transition-colors ${active ? "bg-white text-sky-ink shadow-sm" : "text-sky-ink/70 hover:text-sky-ink"}`;
  return (
    <section className="mt-8">
      <div role="tablist" aria-label="bets" className="tab-pill inline-flex p-1">
        <button role="tab" aria-selected={tab === "open"} onClick={() => setTab("open")} className={pill(tab === "open")}>
          open <span className="tnum ml-1 text-[12px] opacity-60">{openCount}</span>
        </button>
        <button role="tab" aria-selected={tab === "settled"} onClick={() => setTab("settled")} className={pill(tab === "settled")}>
          settled <span className="tnum ml-1 text-[12px] opacity-60">{settledCount}</span>
        </button>
      </div>
      <div role="tabpanel" className="mt-4">
        {tab === "open" ? open : settled}
      </div>
    </section>
  );
}
