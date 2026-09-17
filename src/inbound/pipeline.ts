import type { RateLimiter } from "@/src/access/rate-limit";
import type { Store } from "@/src/db/store";
import type { MediaStore } from "@/src/proof/media-store";
import { storeAttachments, type Fetcher, type StoredAttachment } from "@/src/transport/attachments";
import { Outbox } from "@/src/transport/outbox";
import type { InboundEvent, MessageTransport, OutboundMessage } from "@/src/transport/types";
import { gate, type GateDecision } from "./mention-gate";

export interface TurnContext {
  event: InboundEvent;
  chatId: string;
  userId: string;
  decision: GateDecision;
  firstContact: boolean;
  /** Attachments already copied into durable storage (empty when no media store is configured). */
  attachments: StoredAttachment[];
}

/** Produces the bot's replies for one inbound event. Stage 1 echoes; later stages run the agent. */
export type TurnHandler = (ctx: TurnContext) => Promise<OutboundMessage[]>;

export interface PipelineDeps {
  store: Store;
  transport: MessageTransport;
  handler: TurnHandler;
  botNames: string[];
  /** Hook for Stage 3+: does this sender have a bet awaiting proof in this chat? */
  senderHasOpenBet?: (chatId: string, userId: string) => Promise<boolean>;
  /** Invite-only gate: runs after identity, before anything else. Absent = open access. */
  accessGate?: (chatId: string, userId: string, phone: string, text: string) => Promise<{ allowed: boolean; reply?: string }>;
  /** Durable home for proof media; attachments are downloaded before the 200 when present. */
  media?: MediaStore;
  fetcher?: Fetcher;
  /** Called with (betId, providerMessageId) after a bet card lands, so tapbacks can be resolved. */
  onCardPosted?: (betId: string, providerMessageId: string) => Promise<void>;
  /** Hook for Stage 5: the intro + terms message posted once per chat. */
  introMessage?: () => OutboundMessage | null;
  /**
   * Spam guard. Counts turns that reach the handler (not silent chatter,
   * not reactions) per sender and per chat; over the cap the bot says so
   * once per window, then ignores.
   */
  turnLimit?: { limiter: RateLimiter; perUserPerHour: number; perChatPerHour: number };
  log?: (line: string, extra?: Record<string, unknown>) => void;
}

export type PipelineResult =
  | { outcome: "unauthorized" }
  | { outcome: "unparseable" }
  | { outcome: "duplicate" }
  | { outcome: "ignored"; inboxId: string; reason: string }
  | { outcome: "processed"; inboxId: string; replies: number }
  | { outcome: "failed"; inboxId: string; error: string };

/**
 * verify → claim → normalize → identity → intro → gate → handler → outbox.
 * Everything after `claim` is safe to re-run: the inbox row is the lock and
 * the outbox keys make replies idempotent.
 */
export class InboundPipeline {
  private readonly outbox: Outbox;

  constructor(private readonly deps: PipelineDeps) {
    this.outbox = new Outbox(deps.store, deps.transport);
  }

  async handle(rawBody: string, headers: Record<string, string>): Promise<PipelineResult> {
    const { store, transport } = this.deps;

    if (!transport.verify({ rawBody, headers })) return { outcome: "unauthorized" };

    const event = transport.parseInbound(rawBody);
    if (!event) return { outcome: "unparseable" };

    const inboxId = await store.claimInbound(event);
    if (!inboxId) return { outcome: "duplicate" };

    // Provider media URLs expire in minutes: copy them before anything slow.
    let stored: StoredAttachment[] = [];
    if (this.deps.media && event.attachments.length) {
      try {
        stored = await storeAttachments(event, this.deps.media, this.deps.fetcher);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await store.markInbound(inboxId, "failed", detail);
        return { outcome: "failed", inboxId, error: detail };
      }
    }
    return this.process(inboxId, { ...event, attachments: stored.length ? stored : event.attachments });
  }

  /**
   * `null` = under both caps. Otherwise the nudge to send — a line the first
   * time a cap is crossed in this window, empty text after that.
   */
  private async overTurnLimit(chatId: string, userId: string): Promise<string | null> {
    const { limiter, perUserPerHour, perChatPerHour } = this.deps.turnLimit!;
    const hour = 60 * 60;
    const [user, chat] = await Promise.all([
      limiter.hit(`turn:user:${userId}`, perUserPerHour, hour),
      limiter.hit(`turn:chat:${chatId}`, perChatPerHour, hour),
    ]);
    if (user.allowed && chat.allowed) return null;
    const minutes = Math.max(1, Math.ceil(Math.max(user.retryAfterSecs, chat.retryAfterSecs) / 60));
    if (!user.allowed && user.count === perUserPerHour + 1) return `chill — that's a lot of me in one hour, back for you in ${minutes} min`;
    if (user.allowed && chat.count === perChatPerHour + 1) return `this chat hit my hourly limit — back in ${minutes} min`;
    return "";
  }

  /** Steps after the inbox claim. The cron tick re-runs this for rows that never finished. */
  async process(inboxId: string, event: InboundEvent): Promise<PipelineResult> {
    const { store, handler, botNames, log = () => undefined } = this.deps;
    try {
      await store.markInbound(inboxId, "processing");

      const chat = await store.upsertChat(event);
      const user = await store.upsertUser(event.senderHandle);
      await store.upsertMember(chat.id, user.id, event.senderHandle);
      await store.attachNormalized(inboxId, chat.id, event);

      const firstContact = chat.botIntroducedAt === null;
      let replies = 0;

      if (this.deps.accessGate) {
        const gate = await this.deps.accessGate(chat.id, user.id, event.senderHandle, event.text);
        if (gate.reply) {
          await this.outbox.send(chat.id, { text: gate.reply }, `${event.provider}:${event.providerMessageId}:gate`);
          replies += 1;
        }
        if (!gate.allowed) {
          await store.markInbound(inboxId, "ignored", "not_invited");
          return { outcome: "ignored", inboxId, reason: "not_invited" };
        }
        if (gate.reply) {
          // Just redeemed a code in-thread: the intro can follow next message.
          await store.markInbound(inboxId, "processed");
          return { outcome: "processed", inboxId, replies };
        }
      }

      if (firstContact) {
        const intro = this.deps.introMessage?.();
        const providerMessageId = intro
          ? await this.outbox.send(chat.id, intro, `${event.provider}:${event.providerMessageId}:intro`)
          : null;
        await store.markIntroduced(chat.id, providerMessageId);
        if (intro) replies += 1;
      }

      const decision = gate({
        event,
        botNames,
        recentBotMessageIds: await store.recentOutboundIds(chat.id, 20),
        senderHasOpenBet: (await this.deps.senderHasOpenBet?.(chat.id, user.id)) ?? false,
        lastBotMessageAt: await store.lastOutboundAt(chat.id),
      });

      if (decision.act === false) {
        await store.markInbound(inboxId, "ignored", decision.reason);
        log("ignored", { inboxId, reason: decision.reason });
        return { outcome: "ignored", inboxId, reason: decision.reason };
      }

      if (this.deps.turnLimit && !event.reaction) {
        const nudge = await this.overTurnLimit(chat.id, user.id);
        if (nudge !== null) {
          if (nudge) {
            await this.outbox.send(chat.id, { text: nudge }, `${event.provider}:${event.providerMessageId}:ratelimit`);
            replies += 1;
          }
          await store.markInbound(inboxId, "ignored", "rate_limited");
          log("ignored", { inboxId, reason: "rate_limited" });
          return { outcome: "ignored", inboxId, reason: "rate_limited" };
        }
      }

      const attachments = event.attachments.filter((a): a is StoredAttachment => "storagePath" in a && typeof a.storagePath === "string");
      const messages = await handler({ event, chatId: chat.id, userId: user.id, decision, firstContact, attachments });
      for (const [index, message] of messages.entries()) {
        const key = message.idempotencyKey ?? `${event.provider}:${event.providerMessageId}:${index}`;
        const providerMessageId = await this.outbox.send(chat.id, message, key);
        if (providerMessageId && message.idempotencyKey?.startsWith("card:")) {
          await this.deps.onCardPosted?.(message.idempotencyKey.slice(5), providerMessageId);
        }
        replies += 1;
      }

      await store.markInbound(inboxId, "processed");
      return { outcome: "processed", inboxId, replies };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await store.markInbound(inboxId, "failed", detail);
      log("failed", { inboxId, error: detail });
      return { outcome: "failed", inboxId, error: detail };
    }
  }
}
