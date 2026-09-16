import { describe, expect, it } from "vitest";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { classifyReactionEmoji } from "@/src/transport/types";

describe("FakeTransport", () => {
  it("records sends per chat as a transcript", async () => {
    const t = new FakeTransport();
    await t.send("c1", { text: "one" });
    await t.send("c2", { text: "other" });
    await t.send("c1", { text: "two" });
    expect(t.transcript("c1")).toEqual(["one", "two"]);
    expect(t.sends[0].providerMessageId).toBe("fake-out-1");
  });

  it("parses pre-normalized events and rejects incomplete ones", () => {
    const t = new FakeTransport();
    expect(t.parseInbound(JSON.stringify({ providerMessageId: "m", providerChatId: "c", senderHandle: "+1", text: "hi" }))?.text).toBe("hi");
    expect(t.parseInbound(JSON.stringify({ text: "hi" }))).toBeNull();
  });
});

describe("classifyReactionEmoji", () => {
  it("covers the tapback set", () => {
    expect(classifyReactionEmoji("👍")).toBe("affirm");
    expect(classifyReactionEmoji("❤️")).toBe("affirm");
    expect(classifyReactionEmoji("👎")).toBe("decline");
    expect(classifyReactionEmoji("😂")).toBe("other");
    expect(classifyReactionEmoji(undefined)).toBe("other");
  });
});
