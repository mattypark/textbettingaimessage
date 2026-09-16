import { ShareLink } from "@/app/(site)/folk/share-link";

/** "Invite a friend" — the member's 3-use code, like Instinct's sidebar item. */
export function InvitePanel({ code, uses, maxUses, siteUrl }: { code: string; uses: number; maxUses: number; siteUrl: string }) {
  const url = `${siteUrl.replace(/\/$/, "")}/join?ref=${code}`;
  const left = Math.max(0, maxUses - uses);
  return (
    <section className="card-soft mt-10 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[20px] font-bold">invite a friend</h2>
        <span className={`chip ${left > 0 ? "bg-sticker-green/20 text-[#14703a]" : "bg-sky-ink/8 text-sky-ink/70"}`}>
          {left} of {maxUses} left
        </span>
      </div>
      <p className="mt-1 text-[14px] text-sky-ink/70">bookie is invite-only. each member gets {maxUses} invites; the link adds them straight to the line.</p>
      <ShareLink url={url} />
    </section>
  );
}
