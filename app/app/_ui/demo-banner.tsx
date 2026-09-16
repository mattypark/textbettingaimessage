/** Shown only when WEB_DEMO=1. Nothing on this screen is live. */
export function DemoBanner() {
  return (
    <p className="mx-auto mt-2 w-fit rounded-full bg-sticker-yellow/40 px-4 py-1.5 font-round text-[12.5px] font-semibold text-[#6b5300]">
      demo mode · seeded data, nothing is live
    </p>
  );
}
