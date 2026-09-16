import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SendblueTransport } from "@/src/transport/sendblue/sendblue-transport";
import { TEXT_REACTION, mediaUrls } from "@/src/transport/sendblue/parse";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/sendblue/${name}.json`, import.meta.url), "utf8");

describe("SendblueTransport.parseInbound", () => {
  const transport = new SendblueTransport();

  it("routes group messages to the group id, never the sender", () => {
    const event = transport.parseInbound(fixture("group-text"));
    expect(event).toMatchObject({
      provider: "sendblue",
      providerMessageId: "sb_msg_001",
      providerChatId: "sb_group_1",
      isGroup: true,
      senderHandle: "+15029998282",
      participants: ["+15029998282", "+17135550101", "+17135550102"],
      text: "$20 says I make this half-court shot by Friday",
    });
  });

  it("merges legacy media_url with media_urls and infers mime", () => {
    const event = transport.parseInbound(fixture("group-media"));
    expect(event?.attachments.map((a) => a.mime)).toEqual(["image/jpeg", "video/quicktime"]);
    expect(event?.attachments).toHaveLength(2);
  });

  it("ignores outbound echoes", () => {
    expect(transport.parseInbound(fixture("outbound-echo"))).toBeNull();
  });

  it("turns a text-form tapback into an affirm with no target id", () => {
    const event = transport.parseInbound(fixture("text-reaction-liked"));
    expect(event?.text).toBe("");
    expect(event?.reaction).toEqual({ targetProviderMessageId: "", kind: "affirm", removed: false });
  });
});

describe("Sendblue helpers", () => {
  it("TEXT_REACTION matches curly and straight quotes", () => {
    expect(TEXT_REACTION.test('Liked "hello"')).toBe(true);
    expect(TEXT_REACTION.test("Disliked “hello there”")).toBe(true);
    expect(TEXT_REACTION.test("I liked that")).toBe(false);
  });

  it("mediaUrls dedupes", () => {
    expect(mediaUrls({ media_url: "a", media_urls: ["a", "b", ""] })).toEqual(["a", "b"]);
  });
});
