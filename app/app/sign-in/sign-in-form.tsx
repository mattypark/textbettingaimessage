"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/src/db/browser";
import { Mascot } from "@/app/(site)/folk/mascot";

const E164 = /^\+[1-9]\d{7,14}$/;

/** Phone OTP. The code arrives as an iMessage from the bot's own line. */
export function SignInForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("+1");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = phone.replace(/[^\d+]/g, "");
    if (!E164.test(normalized)) return setError("use your full number with country code, like +15125550123");
    setBusy(true);
    const { error: otpError } = await supabaseBrowser().auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (otpError) return setError(otpError.message);
    setPhone(normalized);
    setStage("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("six digits, the ones bookie just texted you");
    setBusy(true);
    const { error: verifyError } = await supabaseBrowser().auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (verifyError) return setError(verifyError.message);
    router.replace("/app");
    router.refresh();
  }

  const errorId = error ? "sign-in-error" : undefined;

  return (
    <main className="flex flex-1 flex-col items-center px-5 pb-24 pt-6 text-center">
      <Mascot mood={stage === "phone" ? "wave" : "zen"} size={120} />
      <span className="-mt-2 rounded-2xl bg-sky-ink px-4 py-2 text-[15px] font-semibold text-white">{stage === "phone" ? "hi, i&apos;m bookie!" : "check your texts"}</span>

      {stage === "phone" ? (
        <form onSubmit={sendCode} className="flex w-full max-w-sm flex-1 flex-col items-center" noValidate>
          <h1 className="mt-8 text-[32px] font-semibold leading-tight">your number is your account.</h1>
          <p className="mt-3 text-[15px] text-sky-ink/70">the code shows up as a text from the bot&apos;s own line.</p>
          <label className="sr-only" htmlFor="phone">phone</label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            className="tnum mt-10 w-full border-b-2 border-sky-ink bg-transparent pb-3 text-center text-[36px] font-semibold outline-none placeholder:text-sky-ink/55"
            placeholder="+1 555 555 5555"
          />
          {error && <p id={errorId} role="alert" className="mt-4 text-[14px] text-sticker-red">{error}</p>}
          <button type="submit" disabled={busy} className="pill-blue mt-10 min-h-14 w-full text-[18px] font-semibold disabled:opacity-60">
            {busy ? "…" : "text me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex w-full max-w-sm flex-1 flex-col items-center" noValidate>
          <h1 className="mt-8 text-[32px] font-semibold leading-tight">code sent to {phone}</h1>
          <label className="sr-only" htmlFor="code">six-digit code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
            className="tnum mt-10 w-full border-b-2 border-sky-ink bg-transparent pb-3 text-center text-[40px] font-semibold tracking-[0.4em] outline-none placeholder:tracking-[0.4em] placeholder:text-sky-ink/45"
            placeholder="······"
          />
          {error && <p id={errorId} role="alert" className="mt-4 text-[14px] text-sticker-red">{error}</p>}
          <button type="submit" disabled={busy} className="pill-blue mt-10 min-h-14 w-full text-[18px] font-semibold disabled:opacity-60">
            {busy ? "…" : "sign in"}
          </button>
          <button type="button" onClick={() => setStage("phone")} className="mt-4 min-h-11 text-[14px] font-medium text-sky-ink/70 underline-offset-2 hover:underline">
            different number
          </button>
        </form>
      )}
    </main>
  );
}
