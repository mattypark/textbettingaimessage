import Link from "next/link";
import { Mascot, type Mood } from "@/app/(site)/folk/mascot";
import { GlassBall } from "@/app/(site)/folk/stickers";

/** Mascot + one line + one action. Every empty list in /app uses this so nothing looks unfinished. */
export function EmptyState({ mood, title, body, cta }: { mood: Mood; title: string; body?: string; cta?: { href: string; label: string } }) {
  return (
    <div className="card-soft flex flex-col items-center px-6 py-10 text-center font-round">
      <GlassBall size={96}>
        <Mascot mood={mood} size={70} />
      </GlassBall>
      <p className="mt-5 text-[18px] font-semibold text-sky-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-[14px] text-sky-ink/60">{body}</p>}
      {cta && (
        <Link href={cta.href} className="pill-blue mt-6 flex min-h-12 items-center px-6 text-[15px] font-semibold">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
