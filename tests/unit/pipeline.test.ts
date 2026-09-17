import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/src/access/rate-limit";
import { MemoryStore } from "@/src/db/memory-store";
import { echoHandler } from "@/src/inbound/echo-handler";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { FakeTransport } from "@/src/transport/fake/fake-transport";

function build(overrides: Partial<ConstructorParameters<typeof InboundPipeline>[0]> = {}) {
  const store = new MemoryStore();
  const transport = new FakeTransport();
  const pipeline = new InboundPipeline({
    store,
    transport,
    handler: echoHandler,
    botNames: ["mushy"],
    introMessage: () => ({ text: "hi, I'm mushy. terms: /terms" }),
    ...overrides,
  });
  return { store, transport, pipeline };
}

const msg = (id: string, text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: "+15550001", text, isGroup: true, ...extra });

describe("InboundPipeline", () => {
  it("introduces itself once, then replies when named", async () => {
    const { pipeline, transport } = build();
    const first = await pipeline.handle(msg("m1", "hey mushy"), {});
    expect(first).toMatchObject({ outcome: "processed", replies: 2 });
    expect(transport.transcript("g1")[0]).toContain("I'm mushy");
    expect(transport.transcript("g1")[1]).toContain("got it");

    const second = await pipeline.handle(msg("m2", "mushy again"), {});
    expect(second).toMatchObject({ outcome: "processed", replies: 1 });
    expect(transport.transcript("g1")).toHaveLength(3);
  });

  it("stays silent on unrelated group chatter", async () => {
    const { pipeline, transport } = build({ introMessage: () => null });
    const result = await pipeline.handle(msg("m1", "lunch at 1?"), {});
    expect(result).toMatchObject({ outcome: "ignored", reason: "silent" });
    expect(transport.sends).toHaveLength(0);
  });

  it("dedupes a replayed webhook", async () => {
    const { pipeline, transport } = build({ introMessage: () => null });
    await pipeline.handle(msg("m1", "mushy hi"), {});
    const replay = await pipeline.handle(msg("m1", "mushy hi"), {});
    expect(replay).toEqual({ outcome: "duplicate" });
    expect(transport.sends).toHaveLength(1);
  });

  it("treats a reaction on a bot message as addressed", async () => {
    const { pipeline, transport } = build({ introMessage: () => null });
    await pipeline.handle(msg("m1", "mushy hi"), {});
    const botMessageId = transport.sends[0].providerMessageId;
    const reaction = msg("r1", "", { reaction: { targetProviderMessageId: botMessageId, kind: "affirm", removed: false } });
    const result = await pipeline.handle(reaction, {});
    expect(result).toMatchObject({ outcome: "processed" });
    expect(transport.transcript("g1").at(-1)).toContain("👍 noted");
  });

  it("ignores a reaction on someone else's message", async () => {
    const { pipeline } = build({ introMessage: () => null });
    const reaction = msg("r1", "", { reaction: { targetProviderMessageId: "not-ours", kind: "affirm", removed: false } });
    expect(await pipeline.handle(reaction, {})).toMatchObject({ outcome: "ignored" });
  });

  it("marks the inbox row failed when the handler throws, and does not send", async () => {
    const { pipeline, store, transport } = build({
      introMessage: () => null,
      handler: async () => {
        throw new Error("boom");
      },
    });
    const result = await pipeline.handle(msg("m1", "mushy hi"), {});
    expect(result).toMatchObject({ outcome: "failed", error: "boom" });
    expect([...store.inbox.values()][0].status).toBe("failed");
    expect(transport.sends).toHaveLength(0);
  });

  it("acts on DMs without a name", async () => {
    const { pipeline } = build({ introMessage: () => null });
    const dm = msg("m1", "what's up", { isGroup: false });
    expect(await pipeline.handle(dm, {})).toMatchObject({ outcome: "processed", replies: 1 });
  });
});

describe("InboundPipeline turn limit", () => {
  const limited = (perUserPerHour: number, perChatPerHour: number) =>
    build({ introMessage: () => null, turnLimit: { limiter: new MemoryRateLimiter(() => 0), perUserPerHour, perChatPerHour } });

  it("lets a sender trigger the cap, nudges once, then ignores silently until the window rolls", async () => {
    const { pipeline, transport, store } = limited(2, 100);
    expect(await pipeline.handle(msg("m1", "mushy hi"), {})).toMatchObject({ outcome: "processed" });
    expect(await pipeline.handle(msg("m2", "mushy again"), {})).toMatchObject({ outcome: "processed" });
    const third = await pipeline.handle(msg("m3", "mushy again"), {});
    expect(third).toMatchObject({ outcome: "ignored", reason: "rate_limited" });
    expect(transport.transcript("g1").at(-1)).toMatch(/lot of me in one hour/);
    const sends = transport.sends.length;
    expect(await pipeline.handle(msg("m4", "mushy again"), {})).toMatchObject({ outcome: "ignored", reason: "rate_limited" });
    expect(transport.sends.length).toBe(sends);
    expect([...store.inbox.values()].filter((r) => r.status === "ignored" && r.error === "rate_limited")).toHaveLength(2);
  });

  it("does not count silent chatter or reactions", async () => {
    const { pipeline, transport } = limited(1, 100);
    // Before the bot has spoken there is no attention window, so plain chatter is silent and free.
    expect(await pipeline.handle(msg("m0", "lunch at 1?"), {})).toMatchObject({ outcome: "ignored", reason: "silent" });
    await pipeline.handle(msg("m1", "mushy hi"), {});
    const botMessageId = transport.sends[0].providerMessageId;
    const reaction = msg("r1", "", { reaction: { targetProviderMessageId: botMessageId, kind: "affirm", removed: false } });
    expect(await pipeline.handle(reaction, {})).toMatchObject({ outcome: "processed" });
  });

  it("caps the chat as a whole across senders", async () => {
    const { pipeline, transport } = limited(100, 2);
    await pipeline.handle(msg("m1", "mushy hi"), {});
    await pipeline.handle(msg("m2", "mushy hi", { senderHandle: "+15550002" }), {});
    const third = await pipeline.handle(msg("m3", "mushy hi", { senderHandle: "+15550003" }), {});
    expect(third).toMatchObject({ outcome: "ignored", reason: "rate_limited" });
    expect(transport.transcript("g1").at(-1)).toMatch(/chat hit my hourly limit/);
  });
});
