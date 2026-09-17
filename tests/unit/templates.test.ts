import { describe, expect, it } from "vitest";
import { templateReply, worthClassifying } from "@/src/agent/templates";
import type { TurnContext } from "@/src/inbound/pipeline";

const ctx = (text: string, id = "m1"): TurnContext => ({
  event: { provider: "fake", providerEventId: id, providerMessageId: id, providerChatId: "g", isGroup: true, senderHandle: "+1", text, attachments: [], receivedAt: "t", raw: {} },
  chatId: "c",
  userId: "u",
  decision: { act: true, reason: "named" },
  firstContact: false,
  attachments: [],
});

describe("templateReply", () => {
  it("answers a bare wake word, help and thanks without a model", () => {
    expect(templateReply(ctx("hey mushy"), "mushy")?.messages[0].text).toMatch(/bet/);
    expect(templateReply(ctx("Mushy?"), "mushy")?.messages[0].text).toMatch(/bet/);
    expect(templateReply(ctx("yo mushy help"), "mushy")?.messages[0].text).toMatch(/!bet thing ; 20 ; friday/);
    expect(templateReply(ctx("thanks mushy"), "mushy")?.kind).toBe("thanks");
    expect(templateReply(ctx("hey mushy"), "mushy")?.messages[0].text).toBe(templateReply(ctx("hey mushy"), "mushy")?.messages[0].text);
  });

  it("leaves real bets and questions to the model", () => {
    expect(templateReply(ctx("hey mushy 20 says i make this shot by friday"), "mushy")).toBeNull();
    expect(templateReply(ctx("mushy can we change the deadline"), "mushy")).toBeNull();
    expect(templateReply(ctx("mushy help me win"), "mushy")).toBeNull();
  });
});

describe("worthClassifying", () => {
  it("skips plain chatter and keeps stake-shaped or question text", () => {
    expect(worthClassifying("lol")).toBe(false);
    expect(worthClassifying("see you at 8")).toBe(false);
    expect(worthClassifying("make it 30")).toBe(true);
    expect(worthClassifying("who's winning?")).toBe(true);
    expect(worthClassifying("$20 says no")).toBe(true);
  });
});
