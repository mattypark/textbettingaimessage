import { describe, expect, it } from "vitest";
import { accessGate } from "@/src/access/gate";
import { MemoryAccessStore } from "@/src/access/store";
import { MemoryStore } from "@/src/db/memory-store";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { FakeTransport } from "@/src/transport/fake/fake-transport";

describe("MemoryAccessStore", () => {
  it("redeems an invite up to max_uses, idempotent per phone, and hands out an own code", async () => {
    const s = new MemoryAccessStore();
    await s.mint("SEED1234", 2);
    const own = await s.redeemInvite("seed1234", "+15550001");
    expect(own).toMatch(/^[A-Z0-9]{8}$/);
    expect(await s.accessByPhone("+15550001")).toBe("active");
    expect(await s.redeemInvite("SEED1234", "+15550001")).toBe(own); // same phone again
    await s.redeemInvite("SEED1234", "+15550002");
    await expect(s.redeemInvite("SEED1234", "+15550003")).rejects.toMatchObject({ code: "used_up" });
    await expect(s.redeemInvite("NOPE0000", "+15550003")).rejects.toMatchObject({ code: "invalid" });
    const chain = await s.redeemInvite(own, "+15550009");
    expect(chain).not.toBe(own);
  });

  it("waitlist: referrals pull you forward and three of them get you in", async () => {
    const s = new MemoryAccessStore();
    const first = await s.joinWaitlist("+15551");
    for (let i = 2; i <= 400; i++) await s.joinWaitlist(`+1555${i}`);
    const late = await s.joinWaitlist("+15559999");
    expect(late.rank).toBe(401);
    await s.joinWaitlist("+15550a", late.referralCode);
    const afterOne = await s.joinWaitlist("+15559999");
    expect(afterOne.rank).toBeLessThan(120);
    await s.joinWaitlist("+15550b", late.referralCode);
    await s.joinWaitlist("+15550c", late.referralCode);
    expect(await s.promote(3)).toBe(1);
    expect((await s.joinWaitlist("+15559999")).activated).toBe(true);
    expect(await s.myInvite(s.phoneToUser.get("+15559999")!)).toMatchObject({ maxUses: 3, uses: 0 });
    expect(first.rank).toBe(1);
  });
});

describe("pipeline access gate", () => {
  const msg = (id: string, from: string, text: string) => JSON.stringify({ providerMessageId: id, providerChatId: "g1", senderHandle: from, text, isGroup: true });

  async function world() {
    const store = new MemoryStore();
    const transport = new FakeTransport();
    const access = new MemoryAccessStore();
    await access.mint("FRIEND01", 3);
    const handled: string[] = [];
    const pipeline = new InboundPipeline({
      store,
      transport,
      handler: async ({ event }) => {
        handled.push(event.text);
        return [{ text: `handled: ${event.text}` }];
      },
      botNames: ["bookie"],
      introMessage: () => ({ text: "intro" }),
      accessGate: async (chatId, userId, phone, text) => {
        // Memory store learns users as the pipeline creates them.
        if (!access.users.has(userId)) access.registerUser(userId, phone);
        return accessGate(access, "https://bookie.test")(chatId, userId, phone, text);
      },
    });
    return { pipeline, transport, access, handled };
  }

  it("nudges an uninvited sender once, then stays silent; a code unlocks them", async () => {
    const w = await world();
    expect(await w.pipeline.handle(msg("m1", "+1stranger", "bookie make a bet"), {})).toMatchObject({ outcome: "ignored", reason: "not_invited" });
    // No intro for strangers — just the one nudge.
    expect(w.transport.transcript("g1")).toEqual(["bookie is invite-only right now. grab a spot at https://bookie.test/join — or reply \"code XXXXXXXX\" if a friend gave you one."]);
    expect(await w.pipeline.handle(msg("m2", "+1stranger", "bookie pls"), {})).toMatchObject({ outcome: "ignored" });
    expect(w.transport.sends).toHaveLength(1);
    expect(w.handled).toEqual([]);

    expect(await w.pipeline.handle(msg("m3", "+1stranger", "code friend01"), {})).toMatchObject({ outcome: "processed" });
    expect(w.transport.transcript("g1").at(-1)).toMatch(/you're in. your own invite link/);
    expect(await w.pipeline.handle(msg("m4", "+1stranger", "bookie 20 says"), {})).toMatchObject({ outcome: "processed" });
    expect(w.handled).toEqual(["bookie 20 says"]);
  });

  it("a wrong code gets a pointer to the waitlist", async () => {
    const w = await world();
    await w.pipeline.handle(msg("m1", "+1x", "code WRONG123"), {});
    expect(w.transport.transcript("g1").at(-1)).toMatch(/didn't work/);
  });
});
