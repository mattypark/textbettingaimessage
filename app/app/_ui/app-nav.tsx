import Link from "next/link";
import { Avatar } from "@/app/(site)/folk/mascot";

/** /app header: wordmark left, glass pill right. Collapses to wordmark + one button at 375. */
export function AppNav({ signedIn }: { signedIn: boolean }) {
  const item = "flex min-h-11 items-center rounded-[10px] px-3.5 hover:bg-white/70";
  const action = signedIn ? (
    <form action="/app/sign-out" method="post">
      <button className="btn-dark min-h-11 px-4 font-round text-[14px] font-medium">Sign out</button>
    </form>
  ) : (
    <Link href="/app/sign-in" className="btn-dark flex min-h-11 items-center px-4 font-round text-[14px] font-medium">Log in</Link>
  );
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
      <Link href={signedIn ? "/app" : "/"} className="flex items-center gap-2 font-round text-[26px] font-bold text-sky-ink">
        <Avatar size={34} />
        Bookie
      </Link>
      <nav className="flex items-center font-round text-[14px] font-medium text-sky-ink/75">
        <div className="nav-pill hidden items-center gap-1 rounded-2xl p-1.5 sm:flex">
          <Link href="/app" className={item}>Bets</Link>
          <Link href="/terms" className={item}>Rules</Link>
          {action}
        </div>
        <div className="sm:hidden">{action}</div>
      </nav>
    </header>
  );
}
