import Link from "next/link";
import { Mascot } from "./(site)/folk/mascot";
import { FolkNav } from "./(site)/folk/nav";
import { GlassBall } from "./(site)/folk/stickers";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-sky-mist font-round text-sky-ink">
      <FolkNav dark />
      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-32 text-center">
        <GlassBall size={140}>
          <Mascot mood="sleep" size={100} />
        </GlassBall>
        <p className="mt-8 text-[13px] font-semibold uppercase tracking-[0.18em] text-sky-ink/70">404</p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight sm:text-[44px]">no bet at this address.</h1>
        <p className="mt-3 max-w-sm text-[15px] text-sky-ink/70">mushy looked everywhere. nothing was ever locked here.</p>
        <Link href="/" className="btn-dark mt-8 flex min-h-12 items-center px-6 text-[15px] font-semibold">
          back to the start
        </Link>
      </main>
    </div>
  );
}
