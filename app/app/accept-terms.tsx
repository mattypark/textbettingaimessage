"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/src/db/browser";

/** Terms gate for the web. `live=false` (demo) only hides the banner locally. */
export function AcceptTerms({ version, live }: { version: number; live: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!live) return setHidden(true);
    setBusy(true);
    const { error: rpcError } = await supabaseBrowser().rpc("accept_terms_web", { p_version: version });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    router.refresh();
  }

  if (hidden) return null;
  return (
    <div className="card-soft mt-6 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-sticker-yellow p-4 text-[14px]">
      <p>
        accept the{" "}
        <a href="/terms" className="font-semibold underline underline-offset-2">
          terms (v{version})
        </a>{" "}
        before your next stake.
      </p>
      <button onClick={accept} disabled={busy} className="btn-dark min-h-11 px-5 text-[14px] font-semibold disabled:opacity-50">
        {busy ? "…" : "I agree"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sticker-red">
          {error}
        </p>
      )}
    </div>
  );
}
