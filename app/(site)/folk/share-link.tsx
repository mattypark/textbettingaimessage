"use client";

import { useState } from "react";

/** A URL with a copy button. Wraps instead of truncating so the whole link is readable at 375. */
export function ShareLink({ url, dark = true }: { url: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all font-round text-[14px] text-sky-ink">{url}</code>
      <button
        type="button"
        onClick={copy}
        className={`min-h-11 shrink-0 rounded-full px-4 py-2 font-round text-[13px] font-semibold ${dark ? "bg-sky-ink text-white" : "bg-white text-sky-ink shadow"}`}
      >
        {copied ? "copied" : "copy link"}
      </button>
    </div>
  );
}
