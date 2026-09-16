import type {
  InboundEvent,
  MessageTransport,
  OutboundMessage,
  SendResult,
} from "../types";

export interface FakeSend {
  providerChatId: string;
  message: OutboundMessage;
  providerMessageId: string;
}

/**
 * In-memory transport for tests and the e2e replay harness. Records every
 * outbound call so scenarios can assert on the transcript, and accepts
 * pre-normalized `InboundEvent` JSON as its "wire format".
 */
export class FakeTransport implements MessageTransport {
  readonly name = "fake" as const;
  readonly sends: FakeSend[] = [];
  readonly typingCalls: Array<{ providerChatId: string; on: boolean }> = [];
  readonly reactions: Array<{ providerMessageId: string; emoji: string }> = [];
  private seq = 0;

  verify(): boolean {
    return true;
  }

  parseInbound(rawBody: string): InboundEvent | null {
    const parsed = JSON.parse(rawBody) as Partial<InboundEvent>;
    if (!parsed.providerMessageId || !parsed.providerChatId || !parsed.senderHandle) {
      return null;
    }
    return {
      provider: "fake",
      providerEventId: parsed.providerEventId ?? parsed.providerMessageId,
      providerMessageId: parsed.providerMessageId,
      providerChatId: parsed.providerChatId,
      isGroup: parsed.isGroup ?? true,
      senderHandle: parsed.senderHandle,
      participants: parsed.participants,
      text: parsed.text ?? "",
      attachments: parsed.attachments ?? [],
      reaction: parsed.reaction,
      replyToProviderMessageId: parsed.replyToProviderMessageId,
      participantAdded: parsed.participantAdded,
      receivedAt: parsed.receivedAt ?? new Date().toISOString(),
      raw: parsed,
    };
  }

  async send(providerChatId: string, message: OutboundMessage): Promise<SendResult> {
    const providerMessageId = `fake-out-${++this.seq}`;
    this.sends.push({ providerChatId, message, providerMessageId });
    return { providerMessageId };
  }

  async typing(providerChatId: string, on: boolean): Promise<void> {
    this.typingCalls.push({ providerChatId, on });
  }

  async react(providerMessageId: string, emoji: string): Promise<void> {
    this.reactions.push({ providerMessageId, emoji });
  }

  /** Text of everything sent to a chat, in order — the unit tests' transcript. */
  transcript(providerChatId: string): string[] {
    return this.sends
      .filter((s) => s.providerChatId === providerChatId)
      .map((s) => s.message.text);
  }
}
