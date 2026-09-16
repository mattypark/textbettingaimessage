import Link from "next/link";
import { isSupabaseWebConfigured, supabaseServer } from "@/src/db/server";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  let signedIn = false;
  if (isSupabaseWebConfigured()) {
    const { data } = await (await supabaseServer()).auth.getUser();
    signedIn = Boolean(data.user);
  }
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-6 py-5">
        <Link href={signedIn ? "/app" : "/"} className="font-display text-2xl">Bookie</Link>
        <nav className="flex gap-5 text-xs uppercase tracking-wider text-ink-soft">
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          {signedIn && (
            <form action="/app/sign-out" method="post"><button className="uppercase tracking-wider hover:text-ink">Sign out</button></form>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}
