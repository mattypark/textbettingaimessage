/**
 * Cassette: a fresh group meets mushy, accepts the terms, Matt describes a
 * bet in plain English, the model turns it into a card, Jake locks it with
 * a 👍. Then the attention window: a nameless follow-up inside two minutes
 * reaches the (stubbed) classifier, unrelated chatter after it is silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTENTION_WINDOW_MS } from "@/src/inbound/mention-gate";
import { escrowAccount } from "@/src/ledger/types";
import { HANDLES, T0, world, type CassetteStep } from "./harness";

const cassette: CassetteStep[] = [
  { match: /^hey mushy$/i, say: "hey. describe a bet and i'll write it up." },
  {
    match: /says I make this shot by friday/i,
    tool: {
      name: "create_bet",
      input: (snap) => ({
        claim: "I make a half-court shot",
        stake_points: 20,
        deadline: "friday",
        proof_summary: "video of the shot going in",
        proof_required: ["ball leaves hand from half court", "ball goes through the hoop"],
        against_user_ids: [snap.members.find((m) => m.displayName === "Jake")?.id],
        no_proof_rule: "auto_loss",
      }),
    },
  },
  { match: /leaderboard/i, tool: { name: "leaderboard", input: () => ({}) }, say: "standings above." },
  { match: /invite/i, tool: { name: "my_invite", input: () => ({}) }, sayToolResult: true },
];

describe("e2e: create and lock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("intro → terms → card → 👍 lock → attention window", async () => {
    const w = await world({ cassette, classifier: (text) => !/lol/.test(text) });

    // 1. First contact: intro (terms) + the model's reply, both in the group.
    const first = await w.send(HANDLES.matt, "hey mushy");
    expect(first).toMatchObject({ outcome: "processed", replies: 3 }); // intro, sign card, canned wake reply
    expect(w.transcript()[0]).toMatch(/everyone signs once/);
    expect(w.transcript()[1]).toMatch(/\/sign\//);
    expect(w.transcript()[2]).toMatch(/bet/); // canned wake reply, no model turn
    expect(w.toolLog).toHaveLength(0);
    const introId = w.transport.sends[0].providerMessageId;

    // 2. Both bettors accept the terms with a 👍 on the intro.
    // (A reaction acceptance is silent by design; only a typed "I agree" gets a line back.)
    const sendsBeforeTerms = w.transport.sends.length;
    await w.react(HANDLES.matt, introId);
    await w.react(HANDLES.jake, introId);
    expect(await w.store.hasAcceptedTerms(w.users[HANDLES.matt], 1)).toBe(true);
    expect(await w.store.hasAcceptedTerms(w.users[HANDLES.jake], 1)).toBe(true);
    expect(w.transport.sends.length).toBe(sendsBeforeTerms);

    // 3. Plain-English bet → the model calls create_bet → card in the group, Jake named.
    const proposed = await w.send(HANDLES.matt, "mushy 20 says I make this shot by friday, jake you in?");
    expect(proposed).toMatchObject({ outcome: "processed" });
    expect(w.toolLog.at(-1)).toMatch(/waiting on Jake/);
    const card = w.lastSend();
    expect(card?.message.idempotencyKey).toMatch(/^card:/);
    expect(card?.message.text).toContain("Jake");
    expect(w.bet().status).toBe("proposed");
    expect(w.bet().cardProviderMessageId).toBe(card?.providerMessageId);

    // 4. Jake 👍 the card → LOCKED, 20 held from each side.
    await w.react(HANDLES.jake, card!.providerMessageId);
    expect(w.bet().status).toBe("locked");
    expect(w.transcript().at(-1)).toMatch(/LOCKED/);
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).held).toBe(20n);
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).held).toBe(20n);
    expect(w.ledger.balance(escrowAccount(w.bet().id))).toBe(40n);

    // 5. Attention window: nameless follow-up 60 s later reaches the classifier and is acted on.
    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    const followUp = await w.send(HANDLES.sam, "what's the leaderboard");
    expect(followUp).toMatchObject({ outcome: "processed", replies: 1 });
    // Plain-English twin of !leaderboard: answered deterministically, no model turn.
    expect(w.transcript().at(-1)).toMatch(/^1\. .* — \d+ pts/);

    // 6. Unrelated chatter inside the window: classifier says no → nothing sent.
    vi.setSystemTime(new Date(T0.getTime() + 90_000));
    const sendsBefore = w.transport.sends.length;
    expect(await w.send(HANDLES.sam, "lol")).toMatchObject({ outcome: "processed", replies: 0 });
    expect(w.transport.sends.length).toBe(sendsBefore);

    // 7. After the window closes the gate itself goes silent, no classifier involved.
    vi.setSystemTime(new Date(T0.getTime() + 90_000 + ATTENTION_WINDOW_MS + 1_000));
    const later = await w.send(HANDLES.sam, "lunch at 1?");
    expect(later).toMatchObject({ outcome: "ignored", reason: "silent" });
    expect(w.transport.sends.length).toBe(sendsBefore);
  });

  it("hands out a personal invite link on request, by tool or by command", async () => {
    const w = await world({ cassette });
    await w.send(HANDLES.matt, "hey mushy");
    await w.send(HANDLES.matt, "mushy send me an invite");
    const line = w.transcript().at(-1)!;
    expect(line).toMatch(/^your link \(3 uses left\): https:\/\/mushy\.test\/join\?ref=[A-Z0-9]{8} — send it to whoever's in$/);
    await w.send(HANDLES.matt, "!invite");
    expect(w.transcript().at(-1)).toBe(line); // same code, not a new one each time
  });

  it("an unagreed member cannot lock a bet", async () => {
    const w = await world({ cassette });
    await w.send(HANDLES.matt, "hey mushy");
    const introId = w.transport.sends[0].providerMessageId;
    await w.react(HANDLES.matt, introId);
    await w.send(HANDLES.matt, "mushy 20 says I make this shot by friday, jake you in?");
    const card = w.lastSend()!;
    await w.react(HANDLES.jake, card.providerMessageId);
    expect(w.bet().status).toBe("proposed");
    expect(w.transcript().at(-1)).toMatch(/sign first/);
  });
});
