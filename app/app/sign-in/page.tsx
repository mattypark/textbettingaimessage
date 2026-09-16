"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/src/db/browser";

const E164 = /^\+[1-9]\d{7,14}$/;

/** Phone OTP. The code arrives as an iMessage from the bot's own line. */
export default function SignInPage() {
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
    if (!E164.test(normalized)) return setError("Use your full number with country code, like +15125550123.");
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
    if (!/^\d{6}$/.test(code)) return setError("Six digits.");
    setBusy(true);
    const { error: verifyError } = await supabaseBrowser().auth.verifyOtp({ phone, token: code, type: "sms" });
    setBusy(false);
    if (verifyError) return setError(verifyError.message);
    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="slip w-full max-w-sm px-6 py-8">
        <p className="font-display text-3xl">Sign in</p>
        <p className="mt-2 text-sm text-ink-soft">Your number is your account. The code shows up as a text from the bot.</p>

        {stage === "phone" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-3" noValidate>
            <label className="block text-xs uppercase tracking-wider text-ink-soft" htmlFor="phone">Phone</label>
            <input
              id="phone"
              inputMode="tel"
              autoComplete="tel"
              className="num w-full border-b border-ink bg-transparent py-2 text-lg outline-none focus:border-bubble"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            <button type="submit" disabled={busy} className="mt-4 w-full bg-ink py-3 text-sm font-medium text-paper transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.99] disabled:opacity-50">
              {busy ? "Sending…" : "Text me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-3" noValidate>
            <label className="block text-xs uppercase tracking-wider text-ink-soft" htmlFor="code">Code sent to {phone}</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="num w-full border-b border-ink bg-transparent py-2 text-2xl tracking-[0.4em] outline-none focus:border-bubble"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" disabled={busy} className="mt-4 w-full bg-ink py-3 text-sm font-medium text-paper disabled:opacity-50">
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button type="button" onClick={() => setStage("phone")} className="w-full py-2 text-xs text-ink-soft underline-offset-2 hover:underline">
              Different number
            </button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-stamp">{error}</p>}
      </div>
    </main>
  );
}
