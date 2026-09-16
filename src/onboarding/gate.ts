import type { Store } from "@/src/db/store";
import type { InboundEvent } from "@/src/transport/types";
import { TERMS_VERSION, termsUrl } from "./terms";

export const AGREE_TEXT = /^\s*(i\s+)?(agree|accept|yes\s+to\s+the\s+terms|ok\s+terms)\s*[.!]*\s*$/i;

/**
 * Terms gate. A stake can't be created or accepted until the user has
 * accepted the current version — by 👍 on the intro message, by replying
 * "I agree", or on the web.
 */
export class TermsGate {
  constructor(private readonly store: Store, private readonly siteUrl: string) {}

  async accepted(userId: string): Promise<boolean> {
    return this.store.hasAcceptedTerms(userId, TERMS_VERSION);
  }

  needsTermsMessage(name: string): string {
    return `${name}, one thing first: accept the terms (v${TERMS_VERSION}) — 👍 my intro message, reply "I agree", or tap ${termsUrl(this.siteUrl)}. Then we're on.`;
  }

  /** Returns true when this event was itself an acceptance (so callers can reply and stop). */
  async tryAcceptFrom(event: InboundEvent, chatId: string, userId: string): Promise<boolean> {
    if (await this.accepted(userId)) return false;
    if (event.reaction?.kind === "affirm" && !event.reaction.removed) {
      const termsId = await this.store.termsMessageId(chatId);
      if (termsId && termsId === event.reaction.targetProviderMessageId) {
        await this.store.recordTermsAcceptance(userId, TERMS_VERSION, "imessage", event.providerMessageId);
        return true;
      }
      return false;
    }
    if (AGREE_TEXT.test(event.text)) {
      await this.store.recordTermsAcceptance(userId, TERMS_VERSION, "imessage", event.providerMessageId);
      return true;
    }
    return false;
  }
}
