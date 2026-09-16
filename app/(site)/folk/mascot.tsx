/**
 * Bookie's mascot: a round referee with a whistle. Pure SVG so it scales,
 * tints, and never needs an asset request. `mood` swaps the face.
 */
export type Mood = "wave" | "zen" | "cheer" | "sleep" | "money" | "ref";

export function Mascot({ mood = "wave", size = 96, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const eyes =
    mood === "sleep" ? (
      <>
        <path d="M34 50 q6 4 12 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M58 50 q6 4 12 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ) : mood === "zen" ? (
      <>
        <path d="M34 50 q6 -4 12 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M58 50 q6 -4 12 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="40" cy="50" r="4.5" fill="#141414" />
        <circle cx="64" cy="50" r="4.5" fill="#141414" />
      </>
    );
  const mouth =
    mood === "cheer" || mood === "wave" ? (
      <path d="M44 62 q8 8 16 0" stroke="#141414" strokeWidth="3" fill="#141414" strokeLinejoin="round" />
    ) : mood === "money" ? (
      <ellipse cx="52" cy="64" rx="5" ry="6" fill="#141414" />
    ) : (
      <path d="M45 63 q7 4 14 0" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
    );

  return (
    <svg width={size} height={size} viewBox="0 0 104 112" className={className} aria-hidden="true">
      <ellipse cx="52" cy="104" rx="26" ry="5" fill="rgba(0,0,0,0.12)" />
      {/* body */}
      <path d="M22 54 a30 30 0 1 1 60 0 v22 a30 30 0 0 1 -60 0z" fill="#fffdf7" stroke="#141414" strokeWidth="3" />
      {/* referee stripes */}
      <path d="M32 78 h40 M32 86 h40 M34 94 h36" stroke="#141414" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      {/* cap */}
      <path d="M26 44 q26 -22 52 0" fill="#141414" />
      <rect x="22" y="42" width="60" height="6" rx="3" fill="#141414" />
      {/* arm */}
      {mood === "wave" || mood === "cheer" ? (
        <path d="M80 62 q16 -10 12 -26" stroke="#141414" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : mood === "money" ? (
        <circle cx="52" cy="84" r="12" fill="#f5c542" stroke="#141414" strokeWidth="3" />
      ) : null}
      {/* whistle */}
      {mood === "ref" && <rect x="60" y="66" width="14" height="8" rx="4" fill="#c8322b" stroke="#141414" strokeWidth="2" />}
      {eyes}
      {mouth}
      {/* cheeks */}
      <circle cx="31" cy="60" r="3" fill="#f7b5ad" opacity="0.8" />
      <circle cx="73" cy="60" r="3" fill="#f7b5ad" opacity="0.8" />
    </svg>
  );
}

/** The little black circle avatar used in nav, phone header, and cards. */
export function Avatar({ size = 40 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1a1a1a]">
      <Mascot mood="cheer" size={size * 0.8} className="translate-y-[6%]" />
    </span>
  );
}
