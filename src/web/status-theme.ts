import type { Bet, BetStatus } from "@/src/bets/types";
import { STATUS_LABEL } from "@/src/web/format";

/**
 * One place that decides how a bet status looks in the web app: which
 * sticker colour, which sticker glyph, and which face the mascot pulls.
 * Pure data so it can be unit-tested and reused by every /app screen.
 */
export type Accent = "blue" | "green" | "yellow" | "red" | "orange" | "mist";
export type Glyph = "smiley" | "lock" | "camera" | "target" | "bill" | "bubble";
/** Mirrors `Mood` in app/(site)/folk/mascot.tsx; kept here so src/ never imports from app/. */
export type Mood = "wave" | "zen" | "cheer" | "sleep" | "money" | "ref";
export type ViewerOutcome = "won" | "lost" | null;

export interface StatusTheme {
  accent: Accent;
  glyph: Glyph;
  mood: Mood;
  label: string;
}

/** Tailwind classes per accent. Full literal strings so the v4 scanner picks them up. */
export const ACCENT_CLASS: Record<Accent, string> = {
  blue: "bg-sticker-blue/15 text-sticker-blue",
  green: "bg-sticker-green/20 text-[#1d8a44]",
  yellow: "bg-sticker-yellow/35 text-[#8a6a00]",
  red: "bg-sticker-red/15 text-sticker-red",
  orange: "bg-sticker-orange/20 text-[#b8500f]",
  mist: "bg-sky-ink/8 text-sky-ink/60",
};

export const ACCENT_DOT: Record<Accent, string> = {
  blue: "bg-sticker-blue",
  green: "bg-sticker-green",
  yellow: "bg-sticker-yellow",
  red: "bg-sticker-red",
  orange: "bg-sticker-orange",
  mist: "bg-sky-ink/25",
};

/** Did the viewer win or lose a settled bet? `null` when not settled or not a participant. */
export function viewerOutcome(bet: Bet, viewerId: string): ViewerOutcome {
  if (bet.status !== "settled" || !bet.verdict) return null;
  const me = bet.participants.find((p) => p.userId === viewerId);
  if (!me) return null;
  return me.side === bet.verdict.outcome ? "won" : "lost";
}

export function statusTheme(status: BetStatus, outcome: ViewerOutcome = null): StatusTheme {
  const label = STATUS_LABEL[status];
  switch (status) {
    case "proposed":
      return { accent: "yellow", glyph: "smiley", mood: "wave", label };
    case "locked":
      return { accent: "orange", glyph: "lock", mood: "zen", label };
    case "proof_submitted":
    case "judging":
      return { accent: "blue", glyph: "camera", mood: "ref", label };
    case "verdict_posted":
    case "disputed":
      return { accent: "red", glyph: "target", mood: "ref", label };
    case "settled":
      return outcome === "won"
        ? { accent: "green", glyph: "bill", mood: "money", label: "you won" }
        : outcome === "lost"
          ? { accent: "mist", glyph: "bubble", mood: "sleep", label: "you lost" }
          : { accent: "green", glyph: "bill", mood: "cheer", label };
    default:
      return { accent: "mist", glyph: "bubble", mood: "sleep", label };
  }
}

const TERMINAL: ReadonlySet<BetStatus> = new Set(["settled", "expired", "cancelled", "voided"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The dashboard mascot reacts to the whole portfolio, not one bet. */
export function portfolioMood(bets: Bet[], viewerId: string, now = Date.now()): Mood {
  if (bets.some((b) => b.status === "disputed" || b.status === "proof_submitted" || b.status === "judging")) return "ref";
  const recentWins = bets.filter((b) => {
    if (viewerOutcome(b, viewerId) !== "won" || !b.resolvedAt) return false;
    return now - new Date(b.resolvedAt).getTime() < WEEK_MS;
  });
  if (recentWins.length > 0) return "money";
  if (bets.some((b) => !TERMINAL.has(b.status))) return "wave";
  return "sleep";
}
