/**
 * Cassette: a "$20 loser pays" social stake. Matt shares his Venmo, wins on
 * the scripted verdict, and once the bet settles Jake gets a Venmo link
 * pointed at Matt with $20 prefilled. Points balances never move.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/src/jobs/tick";
import { HANDLES, png, T0, world, type CassetteStep } from "./harness";

const cassette: CassetteStep[] = [
  { match: /^hey mushy$/i, say: "hey." },
  {
    match: /loser pays/i,
    tool: {
      name: "create_bet",
      input: (snap) => ({
        claim: "I make a half-court shot",
        stake_points: 0,
        social_stake: "$20 loser pays",
        deadline: "tomorrow",
        proof_summary: "the shot going in",
        proof_required: ["ball goes through the hoop"],
        against_user_ids: [snap.members.find((m) => m.displayName === "Jake")?.id],
        no_proof_rule: "auto_loss",
      }),
    },
  },
  {
    match: /my venmo is/i,
    tool: { name: "set_pay_handle", input: () => ({ provider: "venmo", handle: "@matt-park" }) },
    say: "saved.",
  },
];

const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);

describe("e2e: settle up", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("a social stake settles with a pay link to the winner; the bot holds nothing", async () => {
    const w = await world({ cassette });
    await w.send(HANDLES.matt, "hey mushy");
    const introId = w.transport.sends[0].providerMessageId;
    await w.react(HANDLES.matt, introId);
    await w.react(HANDLES.jake, introId);

    // Handles: one through the agent tool, one through the command.
    await w.send(HANDLES.matt, "mushy my venmo is @matt-park");
    expect(await w.store.payHandles(w.users[HANDLES.matt])).toEqual({ venmo: "matt-park" });
    await w.send(HANDLES.jake, "!pay cashapp $jake");
    expect(w.transcript().at(-1)).toMatch(/Cash App jake/);

    await w.send(HANDLES.matt, "mushy $20 loser pays says I make this shot by tomorrow, jake you in?");
    await w.react(HANDLES.jake, w.lastSend()!.providerMessageId);
    expect(w.bet().status).toBe("locked");
    expect(w.bet().stake.kind).toBe("social");
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).held).toBe(0n);

    await w.photo(HANDLES.matt, "https://cdn.test/shot.png", await png(8));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("verdict_posted");

    w.now.value = hours(30);
    vi.setSystemTime(hours(30));
    await tick(w.tickDeps);
    expect(w.bet().status).toBe("settled");

    const last = w.transcript().at(-1)!;
    expect(w.transcript().at(-2)).toMatch(/SETTLED/);
    expect(last).toContain("Jake → Matt ($20)");
    expect(last).toContain("https://venmo.com/matt-park?txn=pay&amount=20");
    // Points balances untouched by a social stake.
    expect((await w.ledger.wallet(w.users[HANDLES.matt])).available).toBe(100n);
    expect((await w.ledger.wallet(w.users[HANDLES.jake])).available).toBe(100n);
  });
});
