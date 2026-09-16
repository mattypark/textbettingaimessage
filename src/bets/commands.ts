import { randomUUID } from "node:crypto";
import type { TurnContext, TurnHandler } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { betCard, type Names } from "./card";
import type { BetEngine } from "./engine";
import { IllegalTransition } from "./state-machine";
import type { BetStore } from "./store";
import { ACCEPT_WINDOW_HOURS, type Bet } from "./types";

/**
 * Stage-3 slash-style commands, replaced by the agent in Stage 4:
 *   !bet <claim> ; <stake pts | "dinner"> ; <deadline>
 *   !cancel
 * A 👍 on the card from anyone else takes the other side and locks it.
 */
export interface CommandDeps {
  store: BetStore;
  engine: BetEngine;
  names: Names;
  clock?: () => Date;
  /** Returns true when the user may stake (terms accepted). Absent = no gate (tests, dev). */
  mayStake?: (userId: string) => Promise<boolean>;
  needsTermsMessage?: (name: string) => string;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Deadlines are "end of day" for the group, not for the server. */
export const BOT_TZ = process.env.BOT_TZ ?? "America/Chicago";

function zonedParts(date: Date, tz: string): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

/** 23:59 on the calendar day (in `tz`) that is `daysAhead` after `base`. */
export function endOfDayIn(base: Date, daysAhead: number, tz = BOT_TZ): Date {
  const { y, m, d } = zonedParts(new Date(base.getTime() + daysAhead * DAY_MS), tz);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 0, 0);
  const asZoned = zonedParts(new Date(guess), tz);
  const hourInZone = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date(guess)));
  // Offset = how far the zone's wall clock sits from UTC at that instant.
  const offsetMs = Date.UTC(asZoned.y, asZoned.m - 1, asZoned.d, hourInZone % 24) - Date.UTC(y, m - 1, d, 23);
  return new Date(guess - offsetMs);
}

export function parseDeadline(text: string, now: Date, tz = BOT_TZ): Date | null {
  const t = text.trim().toLowerCase();
  const bare = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bare) return endOfDayIn(new Date(Date.UTC(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 12)), 0, tz);
  const iso = Date.parse(text.trim());
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(iso);
  if (t === "today" || t === "tonight") return endOfDayIn(now, 0, tz);
  if (t === "tomorrow") return endOfDayIn(now, 1, tz);
  const inMatch = t.match(/^in (\d+) (hour|hours|day|days|week|weeks)$/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2].startsWith("hour") ? 3_600_000 : inMatch[2].startsWith("day") ? DAY_MS : 7 * DAY_MS;
    return new Date(now.getTime() + n * unit);
  }
  const dayIndex = WEEKDAYS.findIndex((d) => d.startsWith(t.replace(/^(this|next) /, "")));
  if (dayIndex >= 0) {
    const today = zonedParts(now, tz).weekday;
    const delta = (dayIndex - today + 7) % 7 || 7;
    return endOfDayIn(now, delta, tz);
  }
  return null;
}

export function parseStake(text: string): Bet["stake"] | null {
  const t = text.trim().toLowerCase();
  const pts = t.match(/^(\d+)\s*(pts?|points?)?$/);
  if (pts) return { kind: "points", amount: BigInt(pts[1]), currency: "PTS" };
  if (t.length > 0 && t.length <= 80) return { kind: "social", amount: 0n, currency: "PTS", description: text.trim() };
  return null;
}

export interface ParsedBet {
  claim: string;
  stake: Bet["stake"];
  deadlineAt: Date;
}

export function parseBetCommand(text: string, now: Date): ParsedBet | { error: string } {
  const body = text.replace(/^!bet\s*/i, "");
  const [claim, stakeText, deadlineText] = body.split(";").map((s) => s.trim());
  if (!claim || !stakeText || !deadlineText) {
    return { error: 'format: !bet <claim> ; <stake pts or "loser buys dinner"> ; <deadline like friday / tomorrow / in 3 days>' };
  }
  const stake = parseStake(stakeText);
  if (!stake) return { error: `couldn't read the stake "${stakeText}"` };
  const deadlineAt = parseDeadline(deadlineText, now);
  if (!deadlineAt) return { error: `couldn't read the deadline "${deadlineText}"` };
  if (deadlineAt.getTime() < now.getTime() + 15 * 60_000) return { error: "deadline must be at least 15 minutes out" };
  return { claim, stake, deadlineAt };
}

export function buildBet(parsed: ParsedBet, ctx: TurnContext, now: Date): Bet {
  return {
    id: randomUUID(),
    chatId: ctx.chatId,
    creatorId: ctx.userId,
    status: "proposed",
    claim: parsed.claim,
    stake: parsed.stake,
    participants: [{ userId: ctx.userId, side: "for", required: true, acceptedAt: now.toISOString() }],
    proofCriteria: {
      summary: `clear photo or video showing: ${parsed.claim}`,
      required: [parsed.claim],
      optional: [],
      challengeTokenRequired: true,
      mediaKinds: ["photo", "video"],
    },
    judgeKind: "bot",
    open: true,
    createdAt: now.toISOString(),
    acceptByAt: new Date(now.getTime() + ACCEPT_WINDOW_HOURS * 3_600_000).toISOString(),
    deadlineAt: parsed.deadlineAt.toISOString(),
    proofGraceHours: 12,
    noProofRule: "auto_loss",
    version: 0,
  };
}

/** Wraps the engine for the pipeline. Returns replies; the card is posted by the pipeline so its id can be recorded. */
export function commandHandler({ store, engine, names, clock = () => new Date(), mayStake, needsTermsMessage }: CommandDeps): TurnHandler {
  const allowed = async (userId: string) => (mayStake ? mayStake(userId) : true);

  return async (ctx): Promise<OutboundMessage[]> => {
    const { event } = ctx;

    if (event.reaction) {
      if (event.reaction.removed || event.reaction.kind === "other") return [];
      const bet = await store.findByCard(ctx.chatId, event.reaction.targetProviderMessageId);
      if (!bet || bet.status !== "proposed") return [];
      if (event.reaction.kind === "affirm" && !(await allowed(ctx.userId))) {
        return needsTermsMessage ? [{ text: needsTermsMessage(names(ctx.userId)) }] : [];
      }
      try {
        const isParticipant = bet.participants.some((p) => p.userId === ctx.userId);
        if (event.reaction.kind === "decline") {
          if (isParticipant) await engine.apply(bet.id, { type: "DECLINE", userId: ctx.userId });
          return [];
        }
        await engine.apply(bet.id, isParticipant ? { type: "ACCEPT", userId: ctx.userId } : { type: "JOIN", userId: ctx.userId, side: "against" });
      } catch (error) {
        if (!(error instanceof IllegalTransition)) throw error;
      }
      return [];
    }

    const text = event.text.trim();
    if (/^!bet\b/i.test(text)) {
      if (!(await allowed(ctx.userId))) return needsTermsMessage ? [{ text: needsTermsMessage(names(ctx.userId)) }] : [];
      const parsed = parseBetCommand(text, clock());
      if ("error" in parsed) return [{ text: `❓ ${parsed.error}` }];
      const bet = await store.create(buildBet(parsed, ctx, clock()));
      return [{ text: betCard(bet, names), replyToProviderMessageId: event.providerMessageId, idempotencyKey: `card:${bet.id}` }];
    }

    if (/^!cancel\b/i.test(text)) {
      const open = (await store.openBetsInChat(ctx.chatId)).filter((b) => b.creatorId === ctx.userId && b.status === "proposed");
      for (const bet of open) await engine.apply(bet.id, { type: "CANCEL", userId: ctx.userId });
      return [{ text: open.length ? `cancelled ${open.length} open bet(s)` : "nothing to cancel" }];
    }

    if (/^!(balance|bal)\b/i.test(text)) {
      const wallet = await engine.wallet(ctx.userId);
      return [{ text: `${names(ctx.userId)}: ${wallet.available} pts available, ${wallet.held} held` }];
    }

    return [];
  };
}
