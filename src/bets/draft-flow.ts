import type { BetDraft, Store } from "@/src/db/store";
import type { TurnContext } from "@/src/inbound/pipeline";
import type { OutboundMessage } from "@/src/transport/types";
import { betCard, type Names } from "./card";
import { buildBet, parseBetCommand, parseDeadline, parseStake } from "./commands";
import type { BetStore } from "./store";
import type { Bet } from "./types";

/**
 * The scripted bet builder. Zero tokens: "hey mushy" opens a draft, the
 * next three answers are the bet, the card posts. One draft per person
 * per chat; it dies after ten quiet minutes; "cancel"/"nvm" scraps it.
 *
 *   you:   hey mushy            → what's the bet
 *   you:   i make this shot     → how much? (pts, or $ each)
 *   you:   20                   → by when? (friday / tomorrow / in 3 days)
 *   you:   friday               → 🎯 card
 */
export interface DraftDeps {
  store: Store;
  betStore: BetStore;
  namesFor: (chatId: string) => Promise<Names>;
  botName: string;
  clock?: () => Date;
  mayStake?: (userId: string) => Promise<boolean>;
  needsTermsMessage?: (name: string) => string;
  /** Vision judge wants a challenge word in frame; human confirm does not. */
  challengeToken?: boolean;
  /** In assist mode a message that names the bot again is a fresh request for the model, not a draft answer. */
  modelMode?: "assist" | "off";
}

export const DRAFT_TTL_MS = 10 * 60 * 1000;
const CANCEL = /^(cancel|nvm|never ?mind|stop|scrap it|forget it)\s*[!.]*$/i;

const ASK_STAKE = "how much? (points like 20, or $20 each, or a forfeit like loser buys dinner)";
const ASK_DEADLINE = "by when? (friday / tomorrow / in 3 days)";

function stripBot(text: string, botName: string): string {
  return text.replace(new RegExp(`^(hey|yo|ok|okay)?\\s*@?${botName}[,:]?\\s*`, "i"), "").trim();
}

function toDraftStake(stake: Bet["stake"]): NonNullable<BetDraft["stake"]> {
  return { kind: stake.kind === "cash" ? "points" : stake.kind, amount: stake.amount.toString(), currency: stake.currency, description: stake.description };
}

function fromDraftStake(stake: NonNullable<BetDraft["stake"]>): Bet["stake"] {
  return { kind: stake.kind, amount: BigInt(stake.amount), currency: stake.currency, ...(stake.description ? { description: stake.description } : {}) };
}

export function draftFlow(deps: DraftDeps) {
  const clock = deps.clock ?? (() => new Date());

  /** Called when the wake template fired: start collecting. */
  async function open(ctx: TurnContext): Promise<void> {
    await deps.store.setDraft({ chatId: ctx.chatId, userId: ctx.userId, step: "claim", createdAt: clock().toISOString() });
  }

  /** Null = no draft in play for this person; otherwise the reply. */
  async function step(ctx: TurnContext): Promise<OutboundMessage[] | null> {
    const { event } = ctx;
    if (event.reaction || event.attachments.length) return null;
    const draft = await deps.store.getDraft(ctx.chatId, ctx.userId);
    if (!draft) return null;
    const now = clock();
    if (now.getTime() - Date.parse(draft.createdAt) > DRAFT_TTL_MS) {
      await deps.store.clearDraft(ctx.chatId, ctx.userId);
      return null;
    }
    const raw = event.text.trim();
    const namesBot = new RegExp(`(^|\\s)@?${deps.botName}\\b`, "i").test(raw);
    if (namesBot && deps.modelMode !== "off" && !/^!bet\b/i.test(stripBot(raw, deps.botName))) {
      await deps.store.clearDraft(ctx.chatId, ctx.userId);
      return null;
    }
    const text = stripBot(raw, deps.botName);
    if (!text) return null;
    if (CANCEL.test(text)) {
      await deps.store.clearDraft(ctx.chatId, ctx.userId);
      return [{ text: "scrapped" }];
    }

    // A full "!bet a ; b ; c" line at any step finishes the draft in one go.
    if (/^!bet\b/i.test(text) || text.split(";").length === 3) {
      const parsed = parseBetCommand(text.startsWith("!bet") ? text : `!bet ${text}`, now);
      if (!("error" in parsed)) return post(ctx, { ...draft, claim: parsed.claim, stake: toDraftStake(parsed.stake) }, parsed.deadlineAt);
    }

    if (draft.step === "claim") {
      await deps.store.setDraft({ ...draft, step: "stake", claim: text.slice(0, 200) });
      return [{ text: ASK_STAKE }];
    }
    if (draft.step === "stake") {
      const stake = parseStake(text.replace(/^\$?(\d+)\s*(each|a ?piece)$/i, "$$$1 each"));
      if (!stake) return [{ text: `didn't get that — ${ASK_STAKE}` }];
      await deps.store.setDraft({ ...draft, step: "deadline", stake: toDraftStake(stake) });
      return [{ text: ASK_DEADLINE }];
    }
    const deadlineAt = parseDeadline(text, now);
    if (!deadlineAt) return [{ text: `didn't get that — ${ASK_DEADLINE}` }];
    if (deadlineAt.getTime() < now.getTime() + 15 * 60_000) return [{ text: "needs at least 15 min — try tomorrow or friday" }];
    return post(ctx, draft, deadlineAt);
  }

  async function post(ctx: TurnContext, draft: BetDraft, deadlineAt: Date): Promise<OutboundMessage[]> {
    const names = await deps.namesFor(ctx.chatId);
    if (deps.mayStake && !(await deps.mayStake(ctx.userId))) {
      return [{ text: deps.needsTermsMessage ? deps.needsTermsMessage(names(ctx.userId)) : "accept the terms first" }];
    }
    const bet = buildBet({ claim: draft.claim ?? "", stake: fromDraftStake(draft.stake!), deadlineAt }, ctx, clock(), { challengeToken: deps.challengeToken });
    await deps.betStore.create(bet);
    await deps.store.clearDraft(ctx.chatId, ctx.userId);
    return [{ text: betCard(bet, names), replyToProviderMessageId: ctx.event.providerMessageId, idempotencyKey: `card:${bet.id}` }];
  }

  return { open, step };
}
