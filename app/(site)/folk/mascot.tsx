import Image from "next/image";

/**
 * Mushy's mark: the black speech-bubble blob (public/brand). One face, so
 * `mood` only tilts it and pins a small sticker badge (coin, whistle, zzz)
 * where the old drawn mascot changed expression. `tone` picks the black or
 * white cut-out; white is for dark or sky backgrounds.
 */
export type Mood = "wave" | "zen" | "cheer" | "sleep" | "money" | "ref";
type Tone = "black" | "white";

const TILT: Record<Mood, string> = {
  wave: "-rotate-6",
  cheer: "rotate-0",
  zen: "rotate-0",
  sleep: "rotate-6 opacity-80",
  money: "-rotate-3",
  ref: "rotate-3",
};

const BADGE: Partial<Record<Mood, { className: string; label: string }>> = {
  money: { className: "bg-sticker-yellow", label: "pts" },
  ref: { className: "bg-sticker-red", label: "!" },
  sleep: { className: "bg-sky-ink/70 text-white", label: "z" },
};

export function Mascot({ mood = "wave", size = 96, tone = "black", className = "" }: { mood?: Mood; size?: number; tone?: Tone; className?: string }) {
  const src = tone === "white" ? "/brand/mushy-mark-white-512.png" : "/brand/mushy-mark-512.png";
  const badge = BADGE[mood];
  const badgeSize = Math.max(14, Math.round(size * 0.26));
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} className={`h-full w-full select-none object-contain ${TILT[mood]}`} draggable={false} priority={size >= 120} />
      {badge && (
        <span
          className={`absolute flex items-center justify-center rounded-full font-round font-bold text-sky-ink ring-2 ring-white ${badge.className}`}
          style={{ width: badgeSize, height: badgeSize, right: size * 0.08, bottom: size * 0.16, fontSize: badgeSize * 0.5 }}
        >
          {badge.label}
        </span>
      )}
    </span>
  );
}

/** The black circle with the white mark, used in nav, phone header, and cards. */
export function Avatar({ size = 40 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1a1a1a]" aria-hidden="true">
      <Mascot mood="cheer" tone="white" size={Math.round(size * 0.78)} />
    </span>
  );
}
