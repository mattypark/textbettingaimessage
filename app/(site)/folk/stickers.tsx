/**
 * Sticker-style decorations for the sky hero: thick white outline, soft
 * drop shadow, slight tilt. All inline SVG — no image requests, no third-
 * party assets. `float` staggers the idle bob.
 */
const outline = { stroke: "#fff", strokeWidth: 10, strokeLinejoin: "round" as const, paintOrder: "stroke" as const };

export function StickerLockIn({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 160 150" className={className} aria-hidden="true">
      <text x="14" y="70" fontSize="52" fontWeight="800" fill="#1a6cff" fontFamily="var(--font-round)" {...outline}>BET</text>
      <text x="8" y="135" fontSize="64" fontWeight="900" fill="#1a6cff" fontFamily="var(--font-round)" {...outline}>ON.</text>
    </svg>
  );
}

export function StickerBubble({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 130 130" className={className} aria-hidden="true">
      <path d="M20 30 h90 a14 14 0 0 1 14 14 v50 a14 14 0 0 1 -14 14 h-50 l-28 22 v-22 h-12 a14 14 0 0 1 -14 -14 v-50 a14 14 0 0 1 14 -14z" fill="#3ccf63" {...outline} />
      <circle cx="45" cy="69" r="7" fill="#123" /><circle cx="70" cy="69" r="7" fill="#123" /><circle cx="95" cy="69" r="7" fill="#123" />
    </svg>
  );
}

export function StickerSmiley({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 140 140" className={className} aria-hidden="true">
      <circle cx="70" cy="70" r="56" fill="#f7d94a" {...outline} />
      <circle cx="50" cy="60" r="6" fill="#1a1a1a" /><circle cx="90" cy="60" r="6" fill="#1a1a1a" />
      <path d="M46 84 q24 22 48 0" stroke="#1a1a1a" strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function StickerTarget({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 150 150" className={className} aria-hidden="true">
      <circle cx="75" cy="75" r="58" fill="#f0576d" {...outline} />
      <circle cx="75" cy="75" r="40" fill="#fff" /><circle cx="75" cy="75" r="24" fill="#f0576d" /><circle cx="75" cy="75" r="9" fill="#fff" />
    </svg>
  );
}

export function StickerLock({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 140 150" className={className} aria-hidden="true">
      <path d="M40 70 v-18 a30 30 0 0 1 60 0 v18" stroke="#ff8a4c" strokeWidth="16" fill="none" strokeLinecap="round" />
      <rect x="22" y="66" width="96" height="70" rx="18" fill="#ff8a4c" {...outline} />
      <circle cx="70" cy="98" r="9" fill="#1a1a1a" /><rect x="66" y="102" width="8" height="18" rx="4" fill="#1a1a1a" />
    </svg>
  );
}

export function StickerCamera({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 150 130" className={className} aria-hidden="true">
      <rect x="18" y="38" width="114" height="76" rx="16" fill="#5b7cff" {...outline} />
      <rect x="52" y="22" width="46" height="24" rx="8" fill="#5b7cff" {...outline} />
      <circle cx="75" cy="76" r="22" fill="#fff" /><circle cx="75" cy="76" r="13" fill="#1a1a1a" />
    </svg>
  );
}

export function StickerBill({ className = "", ...rest }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...rest} viewBox="0 0 150 130" className={className} aria-hidden="true">
      <rect x="16" y="30" width="118" height="76" rx="12" fill="#3fbf7f" {...outline} />
      <circle cx="75" cy="68" r="20" fill="#fff" opacity="0.9" />
      <text x="75" y="76" textAnchor="middle" fontSize="24" fontWeight="800" fill="#1a1a1a" fontFamily="var(--font-round)">pts</text>
    </svg>
  );
}

/** Frosted glass ball that holds a mascot, like folk's "bubble" tiles. */
export function GlassBall({ children, className = "", size = 120 }: { children: React.ReactNode; className?: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full ${className}`}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95), rgba(220,228,240,0.75) 60%, rgba(180,196,220,0.7))",
          boxShadow: "inset 0 -10px 24px rgba(120,140,170,0.35), inset 0 6px 14px rgba(255,255,255,0.9), 0 18px 40px rgba(20,40,80,0.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function FloatingBubble({ text, side, className = "", style }: { text: string; side: "in" | "out"; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
      className={`pointer-events-none rounded-[18px] px-4 py-2.5 text-[15px] leading-snug shadow-[0_12px_30px_rgba(20,40,80,0.15)] ${side === "out" ? "bg-[#1a8cff] text-white" : "bg-white text-[#1f2a2f]"} ${className}`}
    >
      {text}
    </div>
  );
}
