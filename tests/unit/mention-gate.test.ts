import { describe, expect, it } from "vitest";
import { gate } from "@/src/inbound/mention-gate";
import type { InboundEvent } from "@/src/transport/types";

const base: InboundEvent = {
  provider: "fake",
  providerEventId: "e",
  providerMessageId: "m",
  providerChatId: "g",
  isGroup: true,
  senderHandle: "+1",
  text: "",
  attachments: [],
  receivedAt: "2026-09-16T00:00:00Z",
  raw: {},
};

const run = (patch: Partial<InboundEvent>, extra: Partial<Parameters<typeof gate>[0]> = {}) =>
  gate({ event: { ...base, ...patch }, botNames: ["mushy"], recentBotMessageIds: ["bot1"], senderHasOpenBet: false, ...extra });

describe("gate", () => {
  it.each([
    ["named", { text: "yo mushy set it up" }, true],
    ["@named", { text: "@mushy ?" }, true],
    ["reply to bot", { text: "yes", replyToProviderMessageId: "bot1" }, true],
    ["reply to human", { text: "yes", replyToProviderMessageId: "human9" }, false],
    ["dm", { text: "hi", isGroup: false }, true],
    ["membership", { participantAdded: "+2" }, true],
    ["silent chatter", { text: "lunch?" }, false],
  ])("%s", (_label, patch, expected) => {
    expect(run(patch).act).toBe(expected);
  });

  it("keeps listening for two minutes after it last spoke, via the classifier", () => {
    const now = Date.parse("2026-09-16T00:10:00Z");
    const recent = "2026-09-16T00:09:00Z";
    const stale = "2026-09-16T00:05:00Z";
    expect(run({ text: "yeah 20 pts by friday" }, { lastBotMessageAt: recent, now })).toEqual({ act: "maybe", reason: "attention" });
    expect(run({ text: "lunch?" }, { lastBotMessageAt: stale, now }).act).toBe(false);
    expect(run({ text: "yo mushy" }, { lastBotMessageAt: recent, now })).toEqual({ act: true, reason: "named" });
    expect(run({ text: "" }, { lastBotMessageAt: recent, now }).act).toBe(false);
  });

  it("returns maybe for stake grammar so the classifier decides", () => {
    expect(run({ text: "$20 says he misses" })).toEqual({ act: "maybe", reason: "stake_grammar" });
    expect(run({ text: "i'll bet you a dinner" }).act).toBe("maybe");
  });

  it("acts on an attachment only when the sender owes proof", () => {
    const att = { attachments: [{ url: "u", mime: "image/jpeg" }] };
    expect(run(att).act).toBe(false);
    expect(run(att, { senderHasOpenBet: true })).toEqual({ act: true, reason: "proof_attachment" });
  });
});
