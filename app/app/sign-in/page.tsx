import type { Metadata } from "next";
import Link from "next/link";
import { isWebDemo } from "@/src/web/demo/flag";
import { Mascot } from "@/app/(site)/folk/mascot";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function SignInPage() {
  if (isWebDemo()) {
    return (
      <main className="flex flex-1 flex-col items-center px-5 pb-24 pt-6 text-center">
        <Mascot mood="cheer" size={120} />
        <span className="-mt-2 rounded-2xl bg-sky-ink px-4 py-2 text-[15px] font-semibold text-white">demo mode</span>
        <h1 className="mt-8 text-[32px] font-semibold leading-tight">no sign-in needed.</h1>
        <p className="mt-3 max-w-sm text-[15px] text-sky-ink/60">the app is running on seeded data. sign-in comes back the moment Supabase is configured.</p>
        <Link href="/app" className="pill-blue mt-8 flex min-h-14 w-full max-w-sm items-center justify-center text-[18px] font-semibold">
          enter the demo
        </Link>
      </main>
    );
  }
  return <SignInForm />;
}
