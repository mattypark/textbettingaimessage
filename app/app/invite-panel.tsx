"use client";

import { useState } from "react";

/** "Invite a friend" — the member's 3-use code, like Instinct's sidebar item. */
export function InvitePanel({ code, uses, maxUses, siteUrl }: { code: string; uses: number; maxUses: number; siteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${siteUrl.replace(/\/$/, "")}/join?ref=${code}`;
  const left = Math.max(0, maxUses - uses);
  return (
    <section className="slip mt-6 px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Invite a friend</h2>
        <span className="num text-xs text-ink-soft">{left} of {maxUses} left</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Bookie is invite-only. Each member gets {maxUses} invites.</p>
      <div className="rule mt-3 flex items-center gap-2 pt-3">
        <code className="num min-w-0 flex-1 truncate text-sm">{url}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          className="bg-ink px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-paper"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </section>
  );
}
