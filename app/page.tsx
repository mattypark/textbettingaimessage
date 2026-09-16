import Link from "next/link";
import { ScrollThread } from "./(site)/thread";

const BOT_NUMBER = process.env.NEXT_PUBLIC_BOT_NUMBER ?? "+12053968556";
const smsHref = `sms:${BOT_NUMBER}&body=${encodeURIComponent("hey bookie")}`;
const pretty = BOT_NUMBER.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export default function Landing() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-baseline justify-between px-6 py-5">
        <span className="font-display text-2xl">Bookie</span>
        <nav className="flex gap-5 text-xs uppercase tracking-wider text-ink-soft">
          <a href="#how" className="hover:text-ink">How</a>
          <Link href="/app" className="hover:text-ink">Sign in</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section data-thread-stage className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1fr_minmax(320px,440px)] lg:items-start lg:pt-10">
          <div className="lg:sticky lg:top-24">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">a number for your group chat</p>
            <h1 className="font-display mt-3 max-w-xl text-5xl leading-[0.95] sm:text-7xl">
              Bets between friends, <em>settled</em>.
            </h1>
            <p className="mt-6 max-w-md text-lg text-ink-soft">
              Add one number to the chat. Say the bet. Everyone 👍. Send proof in the thread, and it calls it — points, never money.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href={smsHref} className="inline-flex items-center gap-3 bg-ink px-5 py-3 text-paper transition-transform duration-150 ease-[var(--ease-out)] hover:-translate-y-0.5 active:translate-y-0">
                <span className="text-sm">Text</span>
                <span className="num text-base">{pretty}</span>
              </a>
              <span className="text-sm text-ink-soft">then add it to any group</span>
            </div>
            <ol className="rule mt-10 grid max-w-md grid-cols-3 gap-4 pt-5 text-sm">
              <li><span className="num block text-xs text-ink-soft">01</span>say the bet</li>
              <li><span className="num block text-xs text-ink-soft">02</span>👍 to lock</li>
              <li><span className="num block text-xs text-ink-soft">03</span>proof in thread</li>
            </ol>
          </div>

          <div className="slip">
            <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-lg text-paper">B</span>
              <div className="leading-tight">
                <p className="text-sm">the boys 🏀</p>
                <p className="text-[11px] text-ink-soft">Matt, Jake, Sam, Bookie</p>
              </div>
            </div>
            <ScrollThread />
          </div>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="font-display text-4xl">How a bet gets called</h2>
          <div className="rule mt-6 grid gap-8 pt-8 md:grid-cols-3">
            <Step n="1" title="Terms lock before points move">
              The bot turns what you said into a card: claim, stake, deadline, what the proof must show, who judges. Nothing is held until everyone taps 👍.
            </Step>
            <Step n="2" title="The bettors never vote">
              Proof goes to the bot (or a referee you named), judged only against the locked criteria. A random word has to be in frame. Losers can’t gang up.
            </Step>
            <Step n="3" title="24 hours to dispute">
              Think it got it wrong? Post a small bond and it takes a second look with your reason. Bond comes back if you were right.
            </Step>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="slip grid gap-6 px-6 py-8 md:grid-cols-[auto_1fr] md:items-center">
            <span className="stamp text-stamp">points, not money</span>
            <p className="max-w-2xl text-ink-soft">
              Points can’t be bought, sold, or cashed out — they keep score. “Loser buys dinner” is between you and your friends; we just remember who owes. Real-money stakes between friends aren’t legal for a service like this to hold, so we don’t. <Link href="/terms" className="text-ink underline underline-offset-2">Terms</Link>.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-4 px-6 py-8 text-xs text-ink-soft">
        <span className="font-display text-lg text-ink">Bookie</span>
        <nav className="flex gap-5">
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <a href={smsHref} className="hover:text-ink">Text the bot</a>
        </nav>
      </footer>
    </>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="num text-xs text-ink-soft">0{n}</span>
      <h3 className="mt-1 text-lg">{title}</h3>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
    </div>
  );
}
