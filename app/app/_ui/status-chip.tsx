import type { BetStatus } from "@/src/bets/types";
import { ACCENT_CLASS, statusTheme, type Glyph, type ViewerOutcome } from "@/src/web/status-theme";
import { StickerBill, StickerBubble, StickerCamera, StickerLock, StickerSmiley, StickerTarget } from "@/app/(site)/folk/stickers";

const GLYPH = {
  smiley: StickerSmiley,
  lock: StickerLock,
  camera: StickerCamera,
  target: StickerTarget,
  bill: StickerBill,
  bubble: StickerBubble,
} satisfies Record<Glyph, React.ComponentType<{ className?: string }>>;

/** Status as a folk sticker pill: tiny glyph + label, tinted by the status accent. */
export function StatusChip({ status, outcome = null, className = "" }: { status: BetStatus; outcome?: ViewerOutcome; className?: string }) {
  const theme = statusTheme(status, outcome);
  const Icon = GLYPH[theme.glyph];
  return (
    <span className={`chip ${ACCENT_CLASS[theme.accent]} ${className}`}>
      <Icon className="h-4 w-4" />
      {theme.label}
    </span>
  );
}
