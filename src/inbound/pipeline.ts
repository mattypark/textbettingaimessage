import type { Store } from "@/src/db/store";
import { Outbox } from "@/src/transport/outbox";
import type { InboundEvent, MessageTransport, OutboundMessage } from "@/src/transport/types";
import { gate, type GateDecision } from "./mention-gate";

export interface TurnContext {
  event: InboundEvent;
  chatId: string;
  userId: string;
  decision: GateDecision;
  firstContact: boolean;
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
  /** Called with (betId, providerMessageId) after a bet card lands, so tapbacks can be resolved. */
  onCardPosted?: (betId: string, providerMessageId: string) => Promise<void>;
  /** Hook for Stage 5: the intro + terms message posted once per chat. */
  introMessage?: () => OutboundMessage | null;
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

    return this.process(inboxId, event);
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
      });

      if (decision.act === false) {
        await store.markInbound(inboxId, "ignored", decision.reason);
        log("ignored", { inboxId, reason: decision.reason });
        return { outcome: "ignored", inboxId, reason: decision.reason };
      }

      const messages = await handler({ event, chatId: chat.id, userId: user.id, decision, firstContact });
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
