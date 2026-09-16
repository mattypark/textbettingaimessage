"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avatar, Mascot } from "../(site)/folk/mascot";

type Step = "welcome" | "phone" | "done";
type Result = { status: "active"; ownCode: string } | { status: "waitlist"; referralCode: string; rank: number };

const E164 = /^\+[1-9]\d{7,14}$/;
const DEMO = [
  ["in", "it's friday. you said half-court shot by tonight 💀"],
  ["out", "i know 😭 going now"],
  ["in", "show \"walrus-42\" in the video or it doesn't count"],
  ["out", "sent. it went in. IT WENT IN"],
  ["in", "claim stands, 94%. jake owes you 20 pts and dinner 🍕"],
] as const;

/**
 * folk-style onboarding: welcome (demo thread) → phone (+ code from the
 * link) → result. With a valid code the phone is activated and gets the
 * number; without one it lands on the waitlist with a share link.
 */
export function JoinFlow({ botNumber }: { botNumber: string }) {
  const params = useSearchParams();
  const ref = params.get("ref")?.toUpperCase() ?? "";
  const [step, setStep] = useState<Step>("welcome");
  const [phone, setPhone] = useState("+1");
  const [code, setCode] = useState(ref);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = phone.replace(/[^\d+]/g, "");
    if (!E164.test(normalized)) return setError("use your full number with country code, like +15125550123");
    setBusy(true);
    const res = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: normalized, ref: code.trim() || undefined }) });
    setBusy(false);
    const json = (await res.json().catch(() => ({}))) as Result & { error?: string };
    if (!res.ok) return setError(json.error ?? "something broke, try again");
    setResult(json);
    setStep("done");
  }

  const site = typeof window !== "undefined" ? window.location.origin : "";
  const pretty = botNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#eef1f5] px-5 py-8 font-round text-[#1f2a2f]">
      <Link href="/" className="flex items-center gap-2 text-3xl font-bold"><Avatar size={36} />Bookie</Link>

      {step !== "welcome" && (
        <div className="mt-6 flex w-full max-w-md items-center gap-4">
          <button type="button" onClick={() => setStep("welcome")} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow" aria-label="back">‹</button>
          <div className="flex flex-1 gap-1.5">
            {[0, 1, 2].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= (step === "phone" ? 1 : 2) ? "bg-[#1f2a2f]" : "bg-[#1f2a2f]/15"}`} />)}
          </div>
        </div>
      )}

      {step === "welcome" && (
        <section className="flex w-full max-w-md flex-1 flex-col items-center pt-10">
          <Avatar size={72} />
          <p className="mt-2 text-[15px] text-[#1f2a2f]/60">bookie</p>
          <ol className="mt-8 flex w-full flex-col gap-2.5">
            {DEMO.map(([side, text], i) => (
              <li key={i} className={`flex ${side === "out" ? "justify-end" : "justify-start"}`}>
                <span className={`max-w-[85%] rounded-[20px] px-4 py-2.5 text-[17px] leading-snug ${side === "out" ? "bg-[#1a8cff] text-white" : "bg-[#e5e5ea] text-[#1f2a2f]"}`}>{text}</span>
              </li>
            ))}
          </ol>
          <h1 className="mt-16 text-center text-[32px] font-semibold leading-tight">the bookie in your group chat<br />that actually settles it</h1>
          <button type="button" onClick={() => setStep("phone")} className="pill-blue mt-8 w-full py-4 text-[18px] font-semibold">
            {ref ? "use my invite" : "get started"}
          </button>
          <p className="mt-5 text-[15px] text-[#1f2a2f]/60">already have an account? <Link href="/app" className="font-semibold text-[#1f2a2f] underline">log in</Link></p>
        </section>
      )}

      {step === "phone" && (
        <form onSubmit={submit} className="flex w-full max-w-md flex-1 flex-col items-center pt-16" noValidate>
          <Mascot mood="wave" size={120} />
          <span className="-mt-2 rounded-2xl bg-[#1f2a2f] px-4 py-2 text-[15px] font-semibold text-white">hi, i&apos;m bookie!</span>
          <h1 className="mt-8 text-center text-[32px] font-semibold leading-tight">{ref ? "a friend let you in." : "bookie is invite-only."}</h1>
          <p className="mt-3 max-w-sm text-center text-[15px] text-[#1f2a2f]/60">
            {ref ? "drop your number and you're in — you'll get your own invites too." : "no link? put your number down, share yours, three referrals and you're in."}
          </p>
          <label className="sr-only" htmlFor="phone">phone</label>
          <input id="phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-10 w-full border-b-2 border-[#1f2a2f] bg-transparent pb-3 text-center text-[36px] font-semibold outline-none placeholder:text-[#1f2a2f]/30" placeholder="+1 555 555 5555" />
          <label className="sr-only" htmlFor="code">invite code</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-6 w-full rounded-full bg-white px-5 py-3 text-center text-[15px] uppercase tracking-[0.2em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-[#1f2a2f]/40" placeholder="invite code (optional)" maxLength={12} />
          {error && <p role="alert" className="mt-4 text-[14px] text-[#c8322b]">{error}</p>}
          <button type="submit" disabled={busy} className="pill-blue mt-auto w-full py-4 text-[18px] font-semibold disabled:opacity-60">{busy ? "…" : "continue"}</button>
        </form>
      )}

      {step === "done" && result && (
        <section className="flex w-full max-w-md flex-1 flex-col items-center pt-16 text-center">
          <Mascot mood={result.status === "active" ? "cheer" : "zen"} size={120} />
          {result.status === "active" ? (
            <>
              <h1 className="mt-6 text-[32px] font-semibold leading-tight">you&apos;re in.</h1>
              <p className="mt-3 text-[15px] text-[#1f2a2f]/60">text the number, then add it to any group chat. it only speaks when you say its name.</p>
              <a href={`sms:${botNumber}&body=${encodeURIComponent("hey bookie")}`} className="pill-blue mt-8 w-full py-4 text-[18px] font-semibold">text {pretty}</a>
              <div className="mt-8 w-full rounded-2xl bg-white p-4 text-left shadow">
                <p className="text-[12px] uppercase tracking-wider text-[#1f2a2f]/50">your invite link · 3 uses</p>
                <ShareLink url={`${site}/join?ref=${result.ownCode}`} />
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-[32px] font-semibold leading-tight">you&apos;re #{result.rank} in line.</h1>
              <p className="mt-3 text-[15px] text-[#1f2a2f]/60">every friend who joins with your link moves you up. three and you skip the line.</p>
              <div className="mt-8 w-full rounded-2xl bg-white p-4 text-left shadow">
                <p className="text-[12px] uppercase tracking-wider text-[#1f2a2f]/50">your link</p>
                <ShareLink url={`${site}/join?ref=${result.referralCode}`} />
              </div>
              <a href={`sms:&body=${encodeURIComponent(`bookie settles bets in the group chat. get in with my link: ${site}/join?ref=${result.referralCode}`)}`} className="pill-blue mt-6 w-full py-4 text-[18px] font-semibold">text it to the group</a>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate text-[14px]">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-full bg-[#1f2a2f] px-3 py-1.5 text-[12px] font-semibold text-white"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
