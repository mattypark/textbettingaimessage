"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/src/db/browser";

export function AcceptTerms({ version }: { version: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    const { error: rpcError } = await supabaseBrowser().rpc("accept_terms_web", { p_version: version });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-stamp bg-white px-4 py-3 text-sm">
      <p>
        Accept the <a href="/terms" className="underline underline-offset-2">terms (v{version})</a> before your next stake.
      </p>
      <button onClick={accept} disabled={busy} className="bg-ink px-4 py-2 text-xs font-medium uppercase tracking-wider text-paper disabled:opacity-50">
        {busy ? "…" : "I agree"}
      </button>
      {error && <p role="alert" className="w-full text-stamp">{error}</p>}
    </div>
  );
}
