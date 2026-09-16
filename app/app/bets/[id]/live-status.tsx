"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/src/db/browser";

const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Refreshes the page when this bet's row changes. Needs `bets` in the
 * supabase_realtime publication (backend); until then it subscribes and
 * simply never fires. Renders nothing in demo mode or without Supabase.
 */
export function LiveStatus({ betId, live }: { betId: string; live: boolean }) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!live || !CONFIGURED) return;
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch {
      return;
    }
    const channel = sb
      .channel(`bet-${betId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bets", filter: `id=eq.${betId}` }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 300);
      })
      .subscribe((status) => setSubscribed(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      sb.removeChannel(channel);
    };
  }, [betId, live, router]);

  if (!subscribed) return null;
  return (
    <span className="chip bg-sticker-green/20 text-[#14703a]">
      <span className="h-2 w-2 rounded-full bg-sticker-green" aria-hidden="true" />
      live
    </span>
  );
}
