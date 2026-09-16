"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "./mascot";

/**
 * Fixed glass nav. Hides while scrolling down, returns on scroll up; while
 * hidden a small "text bookie" pill takes its place in the corner, like folk's.
 */
export function FolkNav({ dark = false }: { dark?: boolean }) {
  void dark; // kept for call-site compatibility; the wordmark is dark everywhere now
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > 80 && y > last);
        last = y;
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Dark wordmark on the sky too (like folk): white on the mid-gradient is under 3:1.
  const ink = "text-sky-ink";
  const move = "transition-transform duration-[380ms] ease-[var(--ease-soft)] motion-reduce:transition-none";

  return (
    <>
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-5 sm:px-10 sm:py-6 ${move} ${hidden ? "-translate-y-[120%]" : "translate-y-0"}`}
      >
        <Link href="/" className={`pointer-events-auto flex items-center gap-2 font-round text-3xl font-bold ${ink}`}>
          <Avatar size={34} />
          Bookie
        </Link>
        <nav className="nav-pill pointer-events-auto hidden items-center gap-1 rounded-2xl p-1.5 font-round text-[14.5px] font-medium text-sky-ink/75 md:flex">
          <Link href="/#bets" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Bets</Link>
          <Link href="/#more" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">How it works</Link>
          <Link href="/terms" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Rules</Link>
          <Link href="/app" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Log in</Link>
          <Link href="/join" className="btn-dark ml-1 px-5 py-2 text-[#f5f6f8]">Start now</Link>
        </nav>
        <Link href="/join" className="btn-dark pointer-events-auto px-4 py-2 font-round text-sm md:hidden">Start now</Link>
      </header>

      <Link
        href="/join"
        aria-hidden={!hidden}
        tabIndex={hidden ? 0 : -1}
        className={`pill-3d fixed right-4 top-4 z-40 px-5 py-2.5 font-round text-[14px] font-semibold ${move} ${hidden ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-[160%] opacity-0"}`}
      >
        text bookie
      </Link>
    </>
  );
}
