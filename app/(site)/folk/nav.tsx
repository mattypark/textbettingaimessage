import Link from "next/link";
import { Avatar } from "./mascot";

export function FolkNav({ dark = false }: { dark?: boolean }) {
  const ink = dark ? "text-[#1f2a2f]" : "text-white";
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10">
      <Link href="/" className={`pointer-events-auto flex items-center gap-2 font-round text-3xl font-bold ${ink}`}>
        <Avatar size={34} />
        Bookie
      </Link>
      <nav className="nav-pill pointer-events-auto hidden items-center gap-1 rounded-2xl p-1.5 font-round text-[14.5px] font-medium text-[#1f2a2f]/75 md:flex">
        <a href="#bets" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Bets</a>
        <a href="#more" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">How it works</a>
        <Link href="/terms" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Rules</Link>
        <Link href="/app" className="rounded-[10px] px-3.5 py-2 hover:bg-white/70">Log in</Link>
        <Link href="/join" className="btn-dark ml-1 px-5 py-2 text-[#f5f6f8]">Start now</Link>
      </nav>
      <Link href="/join" className="btn-dark pointer-events-auto px-4 py-2 font-round text-sm md:hidden">Start now</Link>
    </header>
  );
}
