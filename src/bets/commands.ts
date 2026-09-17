import { randomUUID } from "node:crypto";
import type { TurnContext, TurnHandler } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { betCard, type Names } from "./card";
import { disputeBet, findBetByPrefix, refereeDecide } from "./decisions";
import type { BetEngine } from "./engine";
import { IllegalTransition } from "./state-machine";
import type { BetStore } from "./store";
import { fundedBetFor } from "@/src/settle/funded-bet";
import { fundingStatusText } from "@/src/settle/funding";
import { parsePayHandle, PROVIDER_LABEL } from "@/src/settle/pay-links";
import { BOT_TZ } from "./tz";
import { ACCEPT_WINDOW_HOURS, type Bet } from "./types";

/**
 * Stage-3 slash-style commands, replaced by the agent in Stage 4:
 *   !bet <claim> ; <stake pts | "dinner"> ; <deadline>
 *   !cancel
 *   !pay <venmo|cashapp|paypal|applecash> <handle>   (where to be paid when a social stake settles)
 *   !paid [#id]   /   !got [#id]                     (funded bets: bettor sent the stake / holder has the pot)
 *   !invite                                          (your own invite link)
 * A 👍 on the card from anyone else takes the other side and locks it.
 */
export interface CommandDeps {
  store: BetStore;
  engine: BetEngine;
  names: Names;
  /** Preferred over `names` when present: per-chat display names. */
  namesFor?: (chatId: string) => Promise<Names>;
  clock?: () => Date;
  /** Returns true when the user may stake (terms accepted). Absent = no gate (tests, dev). */
  mayStake?: (userId: string) => Promise<boolean>;
  needsTermsMessage?: (name: string) => string;
  /** Records a payment handle for settle-up links. Absent = `!pay` is off. */
  setPayHandle?: (userId: string, provider: string, handle: string) => Promise<void>;
  /** The sender's invite link. Absent = `!invite` is off. */
  inviteLink?: (userId: string) => Promise<string>;
  /** User ids in the chat, for the deterministic leaderboard. */
  members?: (chatId: string) => Promise<string[]>;
  /** False in confirm mode: no challenge word in proof. */
  challengeToken?: boolean;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export { BOT_TZ };

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

/**
 * Strips the ways people (and models) decorate a day: "by friday", "friday
 * at 11:59pm", "end of day tomorrow", "2026-09-18 23:59". Deadlines are
 * always end of that day in the group's zone, so the clock part is noise.
 */
function normalizeDeadline(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^(by|on|before|until|till|due)\s+/, "")
    .replace(/\b(end of (the )?day|eod|midnight|close of business|cob)\b/g, " ")
    .replace(/(\s+at)?\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/g, " ")
    .replace(/(\s+at)?\s+\d{1,2}:\d{2}\b/g, " ")
    .replace(/^(\d{4}-\d{2}-\d{2})\b.*$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDeadline(text: string, now: Date, tz = BOT_TZ): Date | null {
  const t = normalizeDeadline(text);
  const bare = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bare) return endOfDayIn(new Date(Date.UTC(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 12)), 0, tz);
  const iso = Date.parse(text.trim());
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(iso);
  if (t === "today" || t === "tonight") return endOfDayIn(now, 0, tz);
  if (t === "tomorrow" || t === "tmrw" || t === "tmr") return endOfDayIn(now, 1, tz);
  if (t === "next week") return endOfDayIn(now, 7, tz);
  if (t === "this weekend" || t === "weekend") return parseDeadline("sunday", now, tz);
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

export function buildBet(parsed: ParsedBet, ctx: TurnContext, now: Date, options: { challengeToken?: boolean } = {}): Bet {
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
      challengeTokenRequired: options.challengeToken ?? true,
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
export function commandHandler({ store, engine, names: fallbackNames, namesFor, clock = () => new Date(), mayStake, needsTermsMessage, setPayHandle, inviteLink, members, challengeToken }: CommandDeps): TurnHandler {
  const allowed = async (userId: string) => (mayStake ? mayStake(userId) : true);

  return async (ctx): Promise<OutboundMessage[]> => {
    const { event } = ctx;
    const names = namesFor ? await namesFor(ctx.chatId) : fallbackNames;

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
      const bet = await store.create(buildBet(parsed, ctx, clock(), { challengeToken }));
      return [{ text: betCard(bet, names), replyToProviderMessageId: event.providerMessageId, idempotencyKey: `card:${bet.id}` }];
    }

    if (/^!cancel\b/i.test(text)) {
      const open = (await store.openBetsInChat(ctx.chatId)).filter((b) => b.creatorId === ctx.userId && b.status === "proposed");
      for (const bet of open) await engine.apply(bet.id, { type: "CANCEL", userId: ctx.userId });
      return [{ text: open.length ? `scrapped ${open.length} open bet${open.length === 1 ? "" : "s"}` : "nothing to scrap" }];
    }

    const disputeMatch = text.match(/^!dispute\s+#?([0-9a-f]{6,})\s*(.*)$/i);
    if (disputeMatch) {
      const bet = await findBetByPrefix(store, ctx.chatId, disputeMatch[1]);
      if (!bet) return [{ text: "no open bet with that id here" }];
      const result = await disputeBet(store, engine, bet.id, ctx.userId, disputeMatch[2] || undefined);
      return result.ok ? [] : [{ text: `❓ ${result.text}` }];
    }

    const callMatch = text.match(/^!?call\s+#?([0-9a-f]{6,})\s+(yes|no|stands|fails)\b/i);
    if (callMatch) {
      const bet = await findBetByPrefix(store, ctx.chatId, callMatch[1]);
      if (!bet) return [{ text: "no open bet with that id here" }];
      const result = await refereeDecide(store, engine, bet.id, ctx.userId, /^(yes|stands)$/i.test(callMatch[2]));
      return result.ok ? [] : [{ text: `❓ ${result.text}` }];
    }

    // Natural phrasings that map 1:1 to a command never cost a model turn.
    const plain = text.replace(/^(hey|yo)?\s*@?mushy[,:]?\s*/i, "").replace(/[!?.]+$/, "").trim().toLowerCase();
    if (/^!?(what'?s the |show (me )?(the )?|who'?s (winning|up)\s*)?(leaderboard|standings|scoreboard|board)$/.test(plain) || /^who'?s winning$/.test(plain)) {
      const ids = members ? await members(ctx.chatId) : [ctx.userId];
      const rows = await Promise.all(ids.map(async (id) => ({ id, wallet: await engine.wallet(id) })));
      rows.sort((a, b) => Number(b.wallet.available + b.wallet.held - (a.wallet.available + a.wallet.held)));
      const lines = rows.map((r, i) => `${i + 1}. ${names(r.id)} — ${r.wallet.available} pts${r.wallet.held > 0n ? ` (+${r.wallet.held} on the line)` : ""}`);
      return [{ text: lines.join("\n") || "nobody on the board yet" }];
    }
    if (/^(balance|my points|how many points do i have|points)$/.test(plain)) {
      const wallet = await engine.wallet(ctx.userId);
      return [{ text: `${names(ctx.userId)}: ${wallet.available} pts available, ${wallet.held} on the line` }];
    }
    if (/^(invite|invite link|link|send me (an|the) invite( link)?|my invite)$/.test(plain) && inviteLink) {
      return [{ text: await inviteLink(ctx.userId) }];
    }

    if (/^!invite\b/i.test(text)) {
      return inviteLink ? [{ text: await inviteLink(ctx.userId) }] : [];
    }

    if (/^!pay\b/i.test(text)) {
      if (!setPayHandle) return [];
      const parsed = parsePayHandle(text);
      if (!parsed) return [{ text: "❓ format: !pay venmo @you · !pay cashapp $you · !pay paypal you · !pay applecash <your number>" }];
      await setPayHandle(ctx.userId, parsed.provider, parsed.handle);
      return [{ text: `bet — ${PROVIDER_LABEL[parsed.provider]} ${parsed.handle}, whoever loses to you gets a link (i never hold the money)` }];
    }

    // Deterministic twins of the mark_paid / confirm_pot tools, for when the model is off.
    const paidMatch = text.match(/^!(paid|got)\b\s*#?([0-9a-f]{6,})?/i);
    if (paidMatch) {
      const role = paidMatch[1].toLowerCase() === "got" ? "holder" : "bettor";
      const bet = await fundedBetFor(store, ctx.chatId, ctx.userId, paidMatch[2], role);
      if (typeof bet === "string") return [{ text: bet }];
      const funding = role === "holder" ? { ...bet.funding!, confirmedAt: clock().toISOString() } : { ...bet.funding!, paid: { ...bet.funding!.paid, [ctx.userId]: clock().toISOString() } };
      await store.setFunding(bet.id, funding);
      return [{ text: fundingStatusText({ ...bet, funding }, names) }];
    }

    if (/^!(balance|bal)\b/i.test(text)) {
      const wallet = await engine.wallet(ctx.userId);
      return [{ text: `${names(ctx.userId)}: ${wallet.available} pts available, ${wallet.held} held` }];
    }

    return [];
  };
}
