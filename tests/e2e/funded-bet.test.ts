/**
 * Cassette: "$20 each, sam holds it". Sam is in the chat but not in the
 * bet. After LOCKED the bot asks both to pay Sam; each says paid; Sam says
 * got it; the verdict lands; the bot tells Sam to pay the winner the pot.
 * Points never move and Mushy never touches a dollar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/src/jobs/tick";
import { HANDLES, png, T0, world, type CassetteStep } from "./harness";

const cassette: CassetteStep[] = [
  { match: /^hey mushy$/i, say: "hey." },
  {
    match: /sam holds/i,
    tool: {
      name: "create_bet",
      input: (snap) => ({
        claim: "I beat Jake 1v1",
        stake_points: 0,
        social_stake: "$20 each",
        deadline: "tomorrow",
        proof_summary: "final score on screen",
        proof_required: ["score visible"],
        against_user_ids: [snap.members.find((m) => m.displayName === "Jake")?.id],
        holder_user_id: snap.members.find((m) => m.displayName === "Sam")?.id,
        no_proof_rule: "auto_loss",
      }),
    },
  },
  { match: /^paid$/i, tool: { name: "mark_paid", input: () => ({}) }, sayToolResult: true },
  { match: /^got it$/i, tool: { name: "confirm_pot", input: () => ({}) }, sayToolResult: true },
];

const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);

describe("e2e: holder-funded bet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("pay the holder → lock → proof → verdict → holder pays the winner", async () => {
    const w = await world({ cassette });
    await w.send(HANDLES.matt, "hey mushy");
    const introId = w.transport.sends[0].providerMessageId;
    await w.react(HANDLES.matt, introId);
    await w.react(HANDLES.jake, introId);
    await w.send(HANDLES.sam, "!pay venmo @sam-holds");
    await w.send(HANDLES.matt, "!pay cashapp $matt");

    await w.send(HANDLES.matt, "mushy $20 each i beat jake 1v1 by tomorrow, sam holds it");
    const card = w.lastSend()!;
    expect(w.bet().funding).toMatchObject({ amountUsd: 20, holderUserId: w.users[HANDLES.sam] });
    await w.react(HANDLES.jake, card.providerMessageId);
    expect(w.bet().status).toBe("locked");
    const request = w.transcript().at(-1)!;
    expect(request).toContain("$20 each, $40 pot — Sam's holding it");
    expect(request).toContain("https://venmo.com/sam-holds?txn=pay&amount=20");

    // Bettors pay the holder; the tally follows; the holder confirms.
    await w.send(HANDLES.matt, "paid");
    expect(w.transcript().at(-1)).toBe("Matt paid (1/2) — waiting on Jake");
    await w.send(HANDLES.jake, "!paid");
    expect(w.transcript().at(-1)).toBe('Matt, Jake paid (2/2) — Sam say "got it"');
    await w.send(HANDLES.sam, "got it");
    expect(w.transcript().at(-1)).toContain("pot's full — $40 with Sam");
    expect(w.bet().funding?.confirmedAt).toBeTruthy();

    // A bettor cannot confirm the pot; a non-bettor cannot mark paid.
    await w.send(HANDLES.matt, "!got");
    expect(w.transcript().at(-1)).toMatch(/no funded bet is waiting on you to confirm/);

    await w.photo(HANDLES.matt, "https://cdn.test/score.png", await png(3));
    await tick(w.tickDeps);
    w.now.value = hours(30);
    vi.setSystemTime(hours(30));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");
    const payout = w.transcript().at(-1)!;
    expect(payout).toContain("Sam, pay it out — $40 pot:");
    expect(payout).toContain("→ Matt $40");
    expect(payout).toContain("https://cash.app/$matt/40");
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(100n);
  });
});
