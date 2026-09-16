import Link from "next/link";
import { Mascot, type Mood } from "./folk/mascot";
import { FolkNav } from "./folk/nav";

/** Shared frame for /terms and /privacy: sky band with the title, prose in a soft card. */
export function LegalShell({ eyebrow, title, updated, mood, children }: { eyebrow: string; title: string; updated: string; mood: Mood; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-sky-mist font-round text-sky-ink">
      <FolkNav dark />
      <header className="sky-band px-5 pb-24 pt-32 text-center sm:pb-28 sm:pt-40">
        <div className="mx-auto flex justify-center">
          <Mascot mood={mood} size={96} />
        </div>
        <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-sky-ink/70">{eyebrow}</p>
        <h1 className="mt-2 text-[38px] font-bold leading-tight sm:text-[52px]">{title}</h1>
        <p className="mt-2 text-[14px] text-sky-ink/70">last updated {updated}</p>
      </header>
      <main className="mx-auto -mt-14 w-full max-w-2xl flex-1 px-5 pb-24 sm:-mt-16 sm:px-8">
        <article className="card-soft legal-prose p-6 text-[16px] leading-relaxed sm:p-10">{children}</article>
        <p className="mt-8 text-center text-[13px] text-sky-ink/70">
          questions? text the bot, or read the <Link href="/terms" className="underline underline-offset-2">terms</Link> and <Link href="/privacy" className="underline underline-offset-2">privacy</Link> pages.
        </p>
      </main>
    </div>
  );
}
