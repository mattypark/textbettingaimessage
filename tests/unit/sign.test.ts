import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/src/db/memory-store";
import { loadSignPage, normalizePhone, signFromWeb } from "@/src/onboarding/sign";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

async function world() {
  const store = new MemoryStore();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const chat = await store.upsertChat({ provider: "fake", providerEventId: "s", providerMessageId: "s", providerChatId: "g1", isGroup: true, senderHandle: "+17135550100", text: "", attachments: [], receivedAt: "t", raw: {} });
  const matt = await store.upsertUser("+17135550100");
  await store.upsertMember(chat.id, matt.id, "+17135550100");
  return { store, transport, outbox, chat, matt };
}

describe("normalizePhone", () => {
  it("accepts the ways people type a US number", () => {
    expect(normalizePhone("(713) 555-0100")).toBe("+17135550100");
    expect(normalizePhone("713.555.0100")).toBe("+17135550100");
    expect(normalizePhone("+1 713 555 0100")).toBe("+17135550100");
    expect(normalizePhone("555-0100")).toBeNull();
  });
});

describe("sign sheet", () => {
  it("lists who has signed, then records a signature, names the person, accepts terms, and tells the chat", async () => {
    const w = await world();
    expect(await loadSignPage(w.store, w.chat.id)).toMatchObject({ members: [{ signed: false }] });

    const bad = await signFromWeb(w.store, w.outbox, w.chat.id, { fullName: "Dillon Reyes", phone: "713 555 0101", signature: "Someone Else", agreeTerms: true, agreePrivacy: true });
    expect(bad).toMatchObject({ ok: false, error: /match your name/ });

    const ok = await signFromWeb(w.store, w.outbox, w.chat.id, { fullName: "Dillon Reyes", phone: "(713) 555-0101", signature: "dillon reyes", agreeTerms: true, agreePrivacy: true, ip: "203.0.113.5" });
    expect(ok).toEqual({ ok: true, name: "Dillon", signedCount: 1, total: 2 });
    const dillon = (await w.store.chatMembers(w.chat.id)).find((m) => m.phone === "+17135550101")!;
    expect(dillon.displayName).toBe("Dillon");
    expect(await w.store.hasAcceptedTerms(dillon.id, 1)).toBe(true);
    expect(w.store.signatures[0]).toMatchObject({ fullName: "Dillon Reyes", signature: "dillon reyes", termsVersion: 1, ip: "203.0.113.5" });
    expect(w.transport.transcript("g1").at(-1)).toBe("✍️ Dillon signed (1/2)");

    const page = await loadSignPage(w.store, w.chat.id);
    expect(page?.members.map((m) => `${m.name}:${m.signed}`)).toEqual(["…0100:false", "Dillon:true"]);
    expect(await signFromWeb(w.store, w.outbox, w.chat.id, { fullName: "Matt Park", phone: "713-555-0100", signature: "Matt Park", agreeTerms: false, agreePrivacy: true })).toMatchObject({ ok: false });
  });

  it("refuses a link that isn't a chat the bot is in", async () => {
    const w = await world();
    expect(await loadSignPage(w.store, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await signFromWeb(w.store, w.outbox, "00000000-0000-0000-0000-000000000000", { fullName: "A B", phone: "7135550102", signature: "A B", agreeTerms: true, agreePrivacy: true })).toMatchObject({ ok: false });
  });
});
