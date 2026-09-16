import Link from "next/link";
import { Mascot, type Mood } from "./mascot";
import { GlassBall } from "./stickers";

const BET_CARDS: Array<{ title: string; by: string; desc: string; mood: Mood }> = [
  { title: "half-court shot", by: "bookie team", desc: "video proof, ball leaves your hands from half court. no edits.", mood: "cheer" },
  { title: "no doordash this week", by: "bookie team", desc: "loser buys dinner. bank screenshot friday or it's on you.", mood: "money" },
  { title: "5k by sunday", by: "bookie team", desc: "watch screenshot, 5.00 km or more, this week's date in frame.", mood: "wave" },
  { title: "in bed by 1am", by: "bookie team", desc: "screen time screenshot every morning. streaks pay double.", mood: "sleep" },
];

const TRY_THESE = [
  ["beat him in 1v1", "with pickup rules"],
  ["read 30 pages a day", "with study streaks"],
  ["gym 4x this week", "with gym honesty"],
  ["he texts her first", "with group dares"],
  ["under 2h screen time", "with screen time guard"],
  ["cook, don't order", "with no doordash"],
  ["wake up before 8", "with alarm proof"],
  ["finish the essay tonight", "with lock in"],
];

const FEATURED: Array<{ title: string; by: string; desc: string; mood: Mood }> = [
  { title: "fantasy loser tattoo", by: "@raymond_wang", desc: "the classic. bookie tracks the season, calls the loser, posts the receipt…", mood: "ref" },
  { title: "pushup ladder", by: "@naveen", desc: "one more each day for a month. miss a day, everyone else splits your…", mood: "cheer" },
  { title: "who calls it right", by: "bookie team", desc: "pick the score before tipoff. closest wins the pot, ties push.", mood: "zen" },
];

function Ball({ mood, size = 76 }: { mood: Mood; size?: number }) {
  return (
    <GlassBall size={size}>
      <Mascot mood={mood} size={size * 0.72} />
    </GlassBall>
  );
}

export function BetsSection() {
  const tabs = ["for you", "sports", "fitness", "dares", "school", "money", "community"];
  return (
    <section id="bets" className="relative mx-auto max-w-6xl px-5 pb-6 pt-14 sm:pt-20">
      <p className="text-center font-round text-[13px] font-semibold uppercase tracking-[0.18em] text-[#1f2a2f]/45">bets</p>
      <h2 className="mt-3 text-center font-round text-4xl font-semibold text-[#1f2a2f] sm:text-[38px]">give bookie a bet. it starts scoring today.</h2>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <div className="tab-pill flex flex-wrap items-center gap-1 p-1 font-round text-[13.5px] font-semibold">
          {tabs.map((t, i) => (
            <span key={t} className={`rounded-full px-3.5 py-2 ${i === 0 ? "bg-white text-[#1f2a2f] shadow-sm" : "text-[#1f2a2f]/55"}`}>{t}</span>
          ))}
        </div>
        <span className="rounded-full bg-white/70 px-4 py-2.5 font-round text-[13.5px] text-[#1f2a2f]/50 shadow-sm">🔍 search bets</span>
      </div>

      <Row title="for you" more="browse all →">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BET_CARDS.map((c) => (
            <article key={c.title} className="card-soft flex gap-4 p-5">
              <Ball mood={c.mood} />
              <div className="min-w-0">
                <h3 className="font-round text-[15px] font-semibold text-[#1f2a2f]">{c.title}</h3>
                <p className="text-[13px] text-[#1f2a2f]/55">by {c.by} <span className="text-[#1a8cff]">✓</span></p>
                <p className="mt-2 text-[14px] leading-snug text-[#1f2a2f]/75">{c.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </Row>

      <Row title="try these" more="see more →">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRY_THESE.map(([a, b], i) => (
            <div key={a} className="card-soft flex items-center gap-3 rounded-full px-3 py-2.5">
              <Ball mood={(["cheer", "wave", "zen", "sleep", "money", "ref"] as Mood[])[i % 6]} size={44} />
              <div className="min-w-0 font-round">
                <p className="truncate text-[15px] font-semibold text-[#1f2a2f]">{a}</p>
                <p className="truncate text-[12.5px] text-[#1f2a2f]/55">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </Row>

      <Row title="featured" sub="made by bookie + the community" more="browse all →">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED.map((c) => (
            <article key={c.title} className="card-soft flex gap-4 p-5">
              <Ball mood={c.mood} />
              <div className="min-w-0">
                <h3 className="font-round text-[15px] font-semibold text-[#1f2a2f]">{c.title}</h3>
                <p className="text-[13px] text-[#1f2a2f]/55">by {c.by}</p>
                <p className="mt-2 text-[14px] leading-snug text-[#1f2a2f]/75">{c.desc}</p>
              </div>
            </article>
          ))}
          <Link href="/join" className="flex min-h-[180px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#1f2a2f]/20 p-5 text-center font-round">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl text-[#1f2a2f]/60 shadow">+</span>
            <span className="mt-3 text-[15px] font-semibold text-[#1f2a2f]">make your own</span>
            <span className="text-[12.5px] text-[#1f2a2f]/50">any bet, any stakes</span>
          </Link>
        </div>
      </Row>
    </section>
  );
}

function Row({ title, sub, more, children }: { title: string; sub?: string; more: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <div className="mb-4 flex items-baseline justify-between font-round">
        <h3 className="text-[17px] font-semibold text-[#1f2a2f]">
          {title} {sub && <span className="ml-2 text-[13px] font-normal text-[#1f2a2f]/50">{sub}</span>}
        </h3>
        <span className="text-[12.5px] font-medium text-[#1f2a2f]/55">{more}</span>
      </div>
      {children}
    </div>
  );
}

export function StatementSection() {
  return (
    <section className="mx-auto max-w-5xl px-5 pb-6 pt-16 sm:pt-24 lg:pt-28">
      <h2 className="text-center font-round text-4xl font-semibold leading-[1.08] text-[#1f2a2f] sm:text-6xl lg:text-[74px] lg:leading-[1.1]">
        meet bookie, <span className="text-[#1f2a2f]/45">the friend in your group chat</span>
        <span className="mx-3 inline-flex align-middle">
          <GlassBall size={56}><Mascot mood="zen" size={42} /></GlassBall>
          <GlassBall size={56} className="-ml-4"><Mascot mood="cheer" size={42} /></GlassBall>
          <GlassBall size={56} className="-ml-4"><Mascot mood="money" size={42} /></GlassBall>
        </span>
        <span className="text-[#1f2a2f]/45"> that keeps score around the clock.</span>
      </h2>
    </section>
  );
}

export function MoreSection() {
  return (
    <section id="more" className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
      <div className="flex justify-center"><Mascot mood="zen" size={90} /></div>
      <h2 className="mt-2 text-center font-round text-4xl font-semibold text-[#1f2a2f] sm:text-[48px]">bookie does more for you.</h2>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Bento label="what it does" gradient="linear-gradient(160deg,#f9e9e2 0%,#e9e6f7 45%,#d9c6f5 100%)">
          <div className="relative h-56">
            <div className="absolute left-4 top-2 w-64 rotate-[-6deg] rounded-2xl bg-white/90 p-3 font-round text-[13px] shadow-lg">
              <p className="font-semibold">🏀 half-court shot</p><p className="text-[#1f2a2f]/60">Matt vs Jake · 20 pts · due Fri</p>
              <div className="mt-2 flex gap-2 text-[11px]"><span className="rounded-full bg-[#1f2a2f] px-3 py-1 text-white">👍 lock</span><span className="rounded-full bg-[#eef0f3] px-3 py-1">not now</span></div>
            </div>
            <div className="absolute right-2 top-16 w-60 rotate-[4deg] rounded-2xl bg-white/90 p-3 font-round text-[13px] shadow-lg">
              <p className="font-semibold">📸 proof due 11:59 pm</p><p className="text-[#1f2a2f]/60">show “walrus-42” in frame</p>
              <p className="mt-2 rounded-full bg-[#1f2a2f] px-3 py-1 text-center text-[11px] text-white">remind everyone</p>
            </div>
          </div>
          <p className="font-round text-3xl font-semibold leading-tight text-[#1f2a2f] sm:text-[40px]">the <span className="text-[#1f2a2f]/45">friend</span> that<br />keeps the bet honest.</p>
        </Bento>
        <Bento label="disputes" gradient="linear-gradient(160deg,#e3f7f2 0%,#d5f0fb 50%,#cfefff 100%)">
          <div className="relative h-56 font-round text-[13px]">
            <div className="absolute left-0 top-4 rounded-2xl bg-white px-3 py-2 shadow">the ball rimmed out, dispute it</div>
            <div className="absolute right-0 top-14 rounded-2xl bg-[#1a8cff] px-3 py-2 text-white shadow">dispute #a41f0c</div>
            <div className="absolute left-2 top-24 max-w-[80%] rounded-2xl bg-white px-3 py-2 shadow">🚩 bond held. second look with your reason… overturned. bond back, jake +40.</div>
            <div className="absolute -bottom-2 right-2"><Mascot mood="ref" size={80} /></div>
          </div>
          <p className="font-round text-3xl font-semibold leading-tight text-[#1f2a2f] sm:text-[40px]">it takes a<br />second look.</p>
        </Bento>
        <Bento label="privacy" gradient="linear-gradient(160deg,#eef1f5,#e6eaf0)">
          <div className="relative flex h-40 items-center justify-center">
            <div className="absolute left-2 top-2 rotate-[-4deg] rounded-2xl bg-white px-3 py-2 font-round text-[13px] shadow">locking in for 7am?</div>
            <div className="absolute right-2 bottom-2 rotate-[3deg] rounded-2xl bg-white px-3 py-2 font-round text-[13px] shadow">who owes dinner</div>
            <span className="text-7xl">🛡️</span>
          </div>
          <p className="font-round text-2xl font-semibold text-[#1f2a2f] sm:text-[32px]">only acts when you say its name.</p>
        </Bento>
        <Bento label="memory" gradient="linear-gradient(160deg,#eef1f5,#f6efe6)">
          <div className="relative h-40 font-round text-[13px]">
            <div className="absolute right-0 top-2 rounded-2xl bg-[#1a8cff] px-3 py-2 text-white shadow">who's up this month</div>
            <div className="absolute left-0 top-14 max-w-[85%] rounded-2xl bg-white px-3 py-2 shadow">matt +80, sam +20, jake −60 and owes two dinners 😅</div>
          </div>
          <p className="font-round text-2xl font-semibold text-[#1f2a2f] sm:text-[32px]">it remembers who owes what.</p>
        </Bento>
      </div>
    </section>
  );
}

function Bento({ label, gradient, children }: { label: string; gradient: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col justify-between gap-6 rounded-[28px] p-6 sm:p-8" style={{ background: gradient, boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset, 0 20px 50px rgba(20,40,80,0.08)" }}>
      <p className="font-round text-[16px] font-semibold text-[#1f2a2f]/70">{label}</p>
      {children}
    </article>
  );
}

export function MoneySection() {
  const points = ["locks stakes before anyone can back out", "judges proof against the rules you set", "calls no-shows automatically at the deadline", "holds a bond so disputes aren't free", "keeps the leaderboard and the honor score", "never touches money — points only"];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
      <div className="flex justify-center"><Mascot mood="money" size={90} /></div>
      <h2 className="mt-2 text-center font-round text-4xl font-semibold text-[#1f2a2f] sm:text-[48px]">it settles the bet.</h2>
      <p className="mx-auto mt-4 max-w-2xl text-center font-round text-[17px] leading-relaxed text-[#1f2a2f]/60">
        group chats count on nobody following up. bookie remembers every bet, chases the proof, and posts the verdict where everyone can see it. you just react.
      </p>
      <div className="mt-10 grid gap-8 rounded-[28px] p-6 sm:p-10 lg:grid-cols-2" style={{ background: "linear-gradient(160deg,#eef1f5 0%,#e6f1f7 45%,#dff5ee 100%)", boxShadow: "0 20px 50px rgba(20,40,80,0.08)" }}>
        <div className="font-round">
          <p className="text-[16px] font-semibold text-[#1f2a2f]/70">🎯 settled this week</p>
          <ul className="mt-6 space-y-4 text-[18px] text-[#1f2a2f]">
            {points.map((p) => (
              <li key={p} className="flex gap-3"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f2a2f] text-[11px] text-white">✓</span>{p}</li>
            ))}
          </ul>
          <Link href="/terms" className="mt-8 inline-block border-b-2 border-[#1f2a2f]/30 text-[16px] font-semibold text-[#1f2a2f]">see everything bookie enforces →</Link>
          <p className="mt-6 max-w-sm text-[13px] text-[#1f2a2f]/50">🔒 points have no cash value and can't be bought. social stakes are between you and your friends — bookie only keeps score.</p>
        </div>
        <ol className="flex flex-col gap-2 font-round text-[15px]">
          {[
            ["in", "jake's 5k proof is in. watch says 5.02 km, today's date in frame. calling it: claim stands."],
            ["out", "no way he ran that 😭"],
            ["in", "dispute costs 5 pts. want it?"],
            ["out", "…nah"],
            ["in", "settled. jake +20. sam owes dinner from last week, still open 👀", "bold"],
          ].map(([side, text, bold], i) => (
            <li key={i} className={`flex ${side === "out" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[85%] rounded-[18px] px-4 py-2.5 shadow ${side === "out" ? "bg-[#1a8cff] text-white" : "bg-white text-[#1f2a2f]"} ${bold ? "font-semibold" : ""}`}>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function FooterCta() {
  return (
    <footer className="relative mt-10">
      <div className="dome px-5 pb-10 pt-24 text-center">
        <div className="flex justify-center"><Mascot mood="wave" size={150} /></div>
        <h2 className="mx-auto mt-2 max-w-3xl font-round text-4xl font-semibold leading-[1.02] text-[#1f2a2f] sm:text-6xl lg:text-[74px]">meet the bookie that keeps you honest.</h2>
        <p className="mx-auto mt-5 max-w-md font-round text-[17px] text-[#1f2a2f]/60">bookie lives in your group chat, remembers every bet, and calls it so nobody has to.</p>
        <Link href="/join" className="btn-dark mt-8 inline-flex items-center gap-2 px-6 py-3.5 font-round text-[15px]">meet bookie →</Link>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 font-round sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="text-2xl font-bold text-[#1f2a2f]">bookie</p>
          <p className="mt-2 max-w-xs text-[14px] text-[#1f2a2f]/60">a bookie that lives in your group chat. on iMessage today.</p>
        </div>
        <FooterCol title="Product" links={[["What it does", "#more"], ["Bets", "#bets"], ["Rules", "/terms"], ["Sign in", "/app"]]} />
        <FooterCol title="Company" links={[["About", "/"], ["Invite a friend", "/join"], ["Contact", "sms:+12053968556"]]} />
        <FooterCol title="Legal" links={[["Privacy", "/privacy"], ["Terms", "/terms"]]} />
      </div>
      <p className="pb-10 text-center font-round text-[13px] text-[#1f2a2f]/50">© 2026 bookie. points, not money.</p>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="text-[16px] font-bold text-[#1f2a2f]">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-[14px] text-[#1f2a2f]/65">
        {links.map(([label, href]) => (
          <li key={label}><Link href={href} className="hover:text-[#1f2a2f]">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
