import { describe, expect, it } from "vitest";
import { agentHandler } from "@/src/agent/handler";
import { contextBlock, snapshot } from "@/src/agent/context";
import { buildTools } from "@/src/agent/tools";
import { BetEngine } from "@/src/bets/engine";
import { MemoryBetStore } from "@/src/bets/store";
import { MemoryStore } from "@/src/db/memory-store";
import type { TurnContext } from "@/src/inbound/pipeline";
import { InboundPipeline } from "@/src/inbound/pipeline";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { FakeTransport } from "@/src/transport/fake/fake-transport";
import { Outbox } from "@/src/transport/outbox";

const NOW = new Date("2026-09-16T12:00:00Z");

type Runnable = { name: string; run: (input: Record<string, unknown>) => Promise<string> };
const tool = (tools: unknown[], name: string): Runnable => {
  const found = (tools as Runnable[]).find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};

async function world() {
  const store = new MemoryStore();
  const betStore = new MemoryBetStore();
  const ledger = new MemoryLedger();
  const transport = new FakeTransport();
  const outbox = new Outbox(store, transport);
  const users: Record<string, string> = {};
  for (const [handle, name] of [["+1matt", "Matt"], ["+1jake", "Jake"], ["+1sam", null]] as const) {
    const u = await store.upsertUser(handle);
    users[handle] = u.id;
    if (name) await store.setDisplayName(u.id, name);
    await store.recordTermsAcceptance(u.id, 1, "imessage");
    await ledger.grant({ userId: u.id, amount: 100n, idem: `g:${handle}` });
  }
  const chatEvent = { providerMessageId: "seed", providerChatId: "g1", senderHandle: "+1matt", isGroup: true, text: "", attachments: [], receivedAt: NOW.toISOString(), raw: {}, provider: "fake" as const, providerEventId: "seed" };
  const chat = await store.upsertChat(chatEvent);
  for (const handle of Object.keys(users)) await store.upsertMember(chat.id, users[handle], handle);
  const engine = new BetEngine({ store: betStore, ledger, post: (c, m, k) => outbox.send(c, m, k), names: (id) => id, clock: () => NOW });
  const deps = { store, betStore, engine, ledger, siteUrl: "https://example.test", clock: () => NOW, botName: "mushy" };
  const ctx = (text: string, from = "+1matt", extra: Partial<TurnContext["event"]> = {}): TurnContext => ({
    event: { ...chatEvent, providerMessageId: `m-${Math.random()}`, senderHandle: from, text, ...extra },
    chatId: chat.id,
    userId: users[from],
    decision: { act: true, reason: "named" },
    firstContact: false,
    attachments: [],
  });
  return { store, betStore, ledger, transport, outbox, users, chat, engine, deps, ctx };
}

describe("agent tools", () => {
  it("create_bet posts a card via the side channel and names the opponent", async () => {
    const w = await world();
    const c = w.ctx("mushy: 20 says I make this shot by friday, jake you in?");
    const snap = await snapshot(c, w.store, w.betStore, w.ledger, NOW);
    const session = { ctx: c, snap, replies: [] as { text: string; idempotencyKey?: string }[] };
    const create = tool(buildTools(w.deps, session), "create_bet");
    const result = await create.run({
      claim: "I make a half-court shot",
      stake_points: 20,
      deadline: "friday",
      proof_summary: "video of the shot going in",
      proof_required: ["ball leaves hand from half court", "ball goes through the hoop"],
      against_user_ids: [w.users["+1jake"]],
      no_proof_rule: "auto_loss",
    });
    expect(result).toMatch(/waiting on Jake/);
    expect(session.replies[0].idempotencyKey).toMatch(/^card:/);
    expect(session.replies[0].text).toContain("Jake");
    const bet = [...w.betStore.bets.values()][0];
    expect(bet.open).toBe(false);
    expect(bet.participants).toHaveLength(2);
    expect(bet.deadlineAt).toBe("2026-09-19T04:59:00.000Z");
  });

  it("create_bet refuses stakes the sender can't cover and bad deadlines", async () => {
    const w = await world();
    const c = w.ctx("x");
    const session = { ctx: c, snap: await snapshot(c, w.store, w.betStore, w.ledger, NOW), replies: [] };
    const create = tool(buildTools(w.deps, session), "create_bet");
    const base = { claim: "I do it", proof_summary: "p", proof_required: ["p"], against_user_ids: [], no_proof_rule: "auto_loss" as const };
    expect(await create.run({ ...base, stake_points: 500, deadline: "friday" })).toMatch(/only has 100 pts/);
    expect(await create.run({ ...base, stake_points: 5, deadline: "someday" })).toMatch(/deadline/);
    expect(session.replies).toHaveLength(0);
  });

  it("accept_bet joins an open bet and locks it; get_balance / leaderboard / set_name read and write", async () => {
    const w = await world();
    const matt = w.ctx("x");
    const mattSession = { ctx: matt, snap: await snapshot(matt, w.store, w.betStore, w.ledger, NOW), replies: [] };
    await tool(buildTools(w.deps, mattSession), "create_bet").run({
      claim: "I run a 5k", stake_points: 10, deadline: "in 2 days", proof_summary: "watch screenshot", proof_required: ["5.00 km"], against_user_ids: [], no_proof_rule: "void",
    });
    const betId = [...w.betStore.bets.keys()][0];

    const jake = w.ctx("i'm in", "+1jake");
    const jakeSession = { ctx: jake, snap: await snapshot(jake, w.store, w.betStore, w.ledger, NOW), replies: [] };
    const jakeTools = buildTools(w.deps, jakeSession);
    expect(await tool(jakeTools, "accept_bet").run({ bet_id: betId })).toMatch(/locked/);
    expect((await w.betStore.get(betId))?.status).toBe("locked");
    expect(await tool(jakeTools, "get_balance").run({})).toMatch(/Jake: 90 pts available, 10 held/);
    expect(await tool(jakeTools, "leaderboard").run({})).toMatch(/1\. .* — 100 pts/);
    expect(await tool(jakeTools, "set_name").run({ name: "Jakey" })).toBe("ok, Jakey");
    expect((await w.store.chatMembers(w.chat.id)).find((m) => m.id === w.users["+1jake"])?.displayName).toBe("Jakey");
    expect(await tool(jakeTools, "explain_terms").run({})).toMatch(/terms v1/);
  });

  it("contextBlock lists members with ids and open bets with sides", async () => {
    const w = await world();
    const c = w.ctx("x");
    const block = contextBlock(await snapshot(c, w.store, w.betStore, w.ledger, NOW));
    expect(block).toMatch(/sender: Matt \(user_id user-1\)/);
    expect(block).toMatch(/…1sam/);
    expect(block).toMatch(/open bets: none/);
  });
});

describe("agentHandler routing", () => {
  it("sends reactions and !commands to the command layer, screens 'maybe' text, and otherwise runs a turn", async () => {
    const w = await world();
    const calls: string[] = [];
    const handler = agentHandler({
      ...w.deps,
      classifier: async (text) => text.includes("for real"),
      runTurn: async (ctx) => {
        calls.push(ctx.event.text);
        return [{ text: `agent saw: ${ctx.event.text}` }];
      },
    });
    const maybe = (text: string): TurnContext => ({ ...w.ctx(text), decision: { act: "maybe", reason: "stake_grammar" } });

    expect(await handler(maybe("bet, see you at 8"))).toEqual([]);
    expect(await handler(maybe("$20 says he misses, for real"))).toEqual([{ text: "agent saw: $20 says he misses, for real" }]);
    expect(await handler(w.ctx("!balance"))).toEqual([{ text: expect.stringMatching(/100 pts available/) }]);
    expect(await handler(w.ctx("", "+1jake", { reaction: { targetProviderMessageId: "", kind: "affirm", removed: false } }))).toEqual([]);
    expect(calls).toEqual(["$20 says he misses, for real"]);
  });

  it("explains itself when no Claude client is configured", async () => {
    const w = await world();
    const handler = agentHandler({ ...w.deps });
    const out = await handler(w.ctx("mushy set up a bet"));
    expect(out[0].text).toMatch(/not plugged in/);
  });

  it("full pipeline: intro on first contact, then a stubbed agent reply", async () => {
    const w = await world();
    const pipeline = new InboundPipeline({
      store: w.store,
      transport: w.transport,
      handler: agentHandler({ ...w.deps, runTurn: async () => [{ text: "sure, card coming" }] }),
      botNames: ["mushy"],
      introMessage: () => ({ text: "hi i'm mushy" }),
    });
    const res = await pipeline.handle(JSON.stringify({ providerMessageId: "z1", providerChatId: "g1", senderHandle: "+1matt", text: "mushy 20 says i make it", isGroup: true }), {});
    expect(res).toMatchObject({ outcome: "processed", replies: 2 });
    expect(w.transport.transcript("g1")).toEqual(["hi i'm mushy", "sure, card coming"]);
  });
});

describe("terms gate", () => {
  it("nudges an unaccepted user, accepts 'I agree' or a 👍 on the intro, then lets them stake", async () => {
    const w = await world();
    const newbie = await w.store.upsertUser("+1newb");
    await w.store.upsertMember(w.chat.id, newbie.id, "+1newb");
    await w.ledger.grant({ userId: newbie.id, amount: 50n, idem: "g:newb" });
    await w.store.markIntroduced(w.chat.id, "intro-msg-1");
    const handler = agentHandler({ ...w.deps, runTurn: async () => [{ text: "agent ran" }] });
    const as = (text: string, extra: Partial<TurnContext["event"]> = {}): TurnContext => ({ ...w.ctx(text), userId: newbie.id, event: { ...w.ctx(text).event, senderHandle: "+1newb", ...extra } });

    expect((await handler(as("mushy 10 says i can do 20 pushups")))[0].text).toMatch(/sign first/);
    expect((await handler(as("!bet pushups ; 10 ; friday")))[0].text).toMatch(/sign first/);
    expect(await handler(as("", { reaction: { targetProviderMessageId: "some-other-msg", kind: "affirm", removed: false } }))).toEqual([]);

    expect((await handler(as("I agree")))[0].text).toMatch(/you're in/);
    expect(await w.store.hasAcceptedTerms(newbie.id, 1)).toBe(true);
    expect(await handler(as("mushy 10 says i can do 20 pushups"))).toEqual([{ text: "agent ran" }]);

    const other = await w.store.upsertUser("+1other");
    await w.store.upsertMember(w.chat.id, other.id, "+1other");
    const asOther = (): TurnContext => ({ ...w.ctx(""), userId: other.id, event: { ...w.ctx("").event, senderHandle: "+1other", reaction: { targetProviderMessageId: "intro-msg-1", kind: "affirm", removed: false } } });
    expect(await handler(asOther())).toEqual([]);
    expect(await w.store.hasAcceptedTerms(other.id, 1)).toBe(true);
  });
});
