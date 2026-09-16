import { isSupabaseWebConfigured, supabaseServer } from "@/src/db/server";
import { isWebDemo } from "@/src/web/demo/flag";
import { AppNav } from "./_ui/app-nav";
import { DemoBanner } from "./_ui/demo-banner";

/** /app chrome: a short sky band with the nav, then mist. Pages overlap the band with their first card. */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const demo = isWebDemo();
  let signedIn = demo;
  if (!demo && isSupabaseWebConfigured()) {
    const { data } = await (await supabaseServer()).auth.getUser();
    signedIn = Boolean(data.user);
  }
  return (
    <div className="flex min-h-full flex-1 flex-col bg-sky-mist font-round text-sky-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow">
        skip to content
      </a>
      <div className="sky-band pb-14 sm:pb-20">
        <AppNav signedIn={signedIn} />
        {demo && <DemoBanner />}
      </div>
      <div id="main" className="-mt-10 flex flex-1 flex-col sm:-mt-14">
        {children}
      </div>
    </div>
  );
}
