import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LinqTransport } from "@/src/transport/linq/linq-transport";
import { reactionKind } from "@/src/transport/linq/parse";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/linq/${name}.json`, import.meta.url), "utf8");

describe("LinqTransport.parseInbound", () => {
  const transport = new LinqTransport();

  it("normalizes a group text with sender + chat identity", () => {
    const event = transport.parseInbound(fixture("message-received-group-text"));
    expect(event).toMatchObject({
      provider: "linq",
      providerMessageId: "msg_001",
      providerChatId: "chat_group_1",
      isGroup: true,
      senderHandle: "+15029998282",
      text: "$20 says I make this half-court shot by Friday",
      attachments: [],
    });
  });

  it("keeps video attachments with mime, size and provider id, plus reply-to", () => {
    const event = transport.parseInbound(fixture("message-received-group-media"));
    expect(event?.attachments).toEqual([
      {
        url: "https://cdn.linqapp.com/eph/att_1?sig=abc",
        mime: "video/quicktime",
        filename: "IMG_0001.MOV",
        bytes: 4200000,
        providerAttachmentId: "att_1",
      },
    ]);
    expect(event?.replyToProviderMessageId).toBe("msg_bot_card_1");
  });

  it("ignores our own outbound echoes", () => {
    expect(transport.parseInbound(fixture("message-sent-outbound"))).toBeNull();
  });

  it("maps a like tapback to an affirm reaction on the card", () => {
    const event = transport.parseInbound(fixture("reaction-added-like"));
    expect(event?.reaction).toEqual({
      targetProviderMessageId: "msg_bot_card_1",
      kind: "affirm",
      emoji: undefined,
      removed: false,
    });
    expect(event?.senderHandle).toBe("+17135550101");
    expect(event?.providerMessageId).toBe("reaction:evt_rx_001");
  });

  it("maps a custom 👎 to decline", () => {
    const event = transport.parseInbound(fixture("reaction-added-custom-thumbsdown"));
    expect(event?.reaction?.kind).toBe("decline");
    expect(event?.reaction?.emoji).toBe("👎");
  });

  it("surfaces participant.added as a membership event", () => {
    const event = transport.parseInbound(fixture("participant-added"));
    expect(event?.participantAdded).toBe("+12053968556");
    expect(event?.providerChatId).toBe("chat_group_1");
  });

  it("returns null on garbage", () => {
    expect(transport.parseInbound("not json")).toBeNull();
    expect(transport.parseInbound(JSON.stringify({ event_type: "call.ringing", data: {} }))).toBeNull();
  });
});

describe("reactionKind", () => {
  it.each([
    ["love", null, "affirm"],
    ["like", null, "affirm"],
    ["dislike", null, "decline"],
    ["laugh", null, "other"],
    ["custom", "✅", "affirm"],
    ["custom", "❌", "decline"],
    ["custom", "🤔", "other"],
  ])("%s / %s → %s", (type, emoji, expected) => {
    expect(reactionKind(type, emoji)).toBe(expected);
  });
});

/**
 * Payloads captured from the real line by `npm run linq:capture`
 * (tests/fixtures/linq/live-*.json). Absent until Stage 0 has run; once
 * present, every inbound one must normalize.
 */
const liveDir = new URL("../fixtures/linq/", import.meta.url);
const liveFiles = readdirSync(liveDir).filter((f) => f.startsWith("live-") && f.endsWith(".json")).sort();

describe.skipIf(liveFiles.length === 0)("live Linq captures", () => {
  const transport = new LinqTransport();
  for (const file of liveFiles) {
    it(`normalizes ${file}`, () => {
      const raw = readFileSync(new URL(file, liveDir), "utf8");
      const payload = JSON.parse(raw) as { event_type: string; data: { direction?: string; is_from_me?: boolean } };
      const event = transport.parseInbound(raw);
      const outbound = payload.data.direction === "outbound" || payload.data.is_from_me === true;
      if (outbound) {
        expect(event).toBeNull();
        return;
      }
      expect(event, `${payload.event_type} should normalize`).not.toBeNull();
      expect(event?.providerChatId).toBeTruthy();
      expect(event?.senderHandle).toBeTruthy();
      expect(raw).not.toMatch(/\+1(?!2053968556|713555\d{4})\d{10}/);
    });
  }
});
