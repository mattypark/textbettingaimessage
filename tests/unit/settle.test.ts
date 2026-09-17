import { describe, expect, it } from "vitest";
import type { Bet } from "@/src/bets/types";
import { dollarAmount, parsePayHandle, payLink, settleUpText } from "@/src/settle/pay-links";

const bet = (stake: Bet["stake"], outcome: "for" | "against" = "for"): Bet => ({
  id: "abcdef0123",
  chatId: "c",
  creatorId: "matt",
  status: "settled",
  claim: "I make the shot",
  stake,
  participants: [
    { userId: "matt", side: "for", required: true },
    { userId: "jake", side: "against", required: true },
  ],
  proofCriteria: { summary: "s", required: ["r"], optional: [], challengeTokenRequired: true, mediaKinds: ["photo"] },
  judgeKind: "bot",
  createdAt: "2026-09-17T00:00:00Z",
  acceptByAt: "2026-09-18T00:00:00Z",
  deadlineAt: "2026-09-19T00:00:00Z",
  proofGraceHours: 12,
  noProofRule: "auto_loss",
  verdict: { outcome, confidence: 0.9, pass: 1 },
  version: 4,
});

describe("parsePayHandle", () => {
  it("reads the command and casual forms, strips @ and $", () => {
    expect(parsePayHandle("!pay venmo @matt-park")).toEqual({ provider: "venmo", handle: "matt-park" });
    expect(parsePayHandle("my cash app is $matt")).toEqual({ provider: "cashapp", handle: "matt" });
    expect(parsePayHandle("paypal: mattp")).toEqual({ provider: "paypal", handle: "mattp" });
    expect(parsePayHandle("!pay applecash +15029998282")).toEqual({ provider: "applecash", handle: "+15029998282" });
    expect(parsePayHandle("!pay zelle matt")).toBeNull();
    expect(parsePayHandle("venmo me")).toBeNull();
  });
});

describe("dollarAmount + payLink", () => {
  it("finds a dollar figure only when one is written", () => {
    expect(dollarAmount("$20 loser pays")).toBe(20);
    expect(dollarAmount("loser owes 15 bucks")).toBe(15);
    expect(dollarAmount("loser buys dinner")).toBeNull();
    expect(dollarAmount("20 pushups")).toBeNull();
  });

  it("builds provider links with the amount and note prefilled; Apple Cash has none", () => {
    expect(payLink("venmo", "matt", 20, "mushy #abcdef")).toBe("https://venmo.com/matt?txn=pay&amount=20&note=mushy%20%23abcdef");
    expect(payLink("cashapp", "matt", 12.5, "x")).toBe("https://cash.app/$matt/12.50");
    expect(payLink("paypal", "matt", null, "x")).toBe("https://paypal.me/matt");
    expect(payLink("applecash", "+1555", 20, "x")).toBeNull();
  });
});

describe("settleUpText", () => {
  const name = (id: string) => id[0].toUpperCase() + id.slice(1);

  it("posts links for the winner's handles on a social stake, naming who pays whom", async () => {
    const text = await settleUpText({
      bet: bet({ kind: "social", amount: 0n, currency: "PTS", description: "$20 loser pays" }),
      name,
      handlesOf: async (id) => (id === "matt" ? { venmo: "matt-park", applecash: "+15029998282" } : {}),
    });
    expect(text).toContain("Jake → Matt ($20)");
    expect(text).toContain("Venmo: https://venmo.com/matt-park?txn=pay&amount=20");
    expect(text).toContain("Apple Cash: send it in this thread to +15029998282");
    expect(text).toContain("i keep score, you pay each other");
  });

  it("never attaches links to a points stake, and says nothing when the winner has no handle", async () => {
    const handlesOf = async () => ({ venmo: "matt" });
    expect(await settleUpText({ bet: bet({ kind: "points", amount: 20n, currency: "PTS" }), name, handlesOf })).toBeNull();
    expect(await settleUpText({ bet: bet({ kind: "social", amount: 0n, currency: "PTS", description: "$5" }), name, handlesOf: async () => ({}) })).toBeNull();
  });

  it("uses the stake wording when no dollar figure is present", async () => {
    const text = await settleUpText({
      bet: bet({ kind: "social", amount: 0n, currency: "PTS", description: "loser buys dinner" }, "against"),
      name,
      handlesOf: async (id) => (id === "jake" ? { cashapp: "jake" } : {}),
    });
    expect(text).toContain("Matt → Jake (loser buys dinner)");
    expect(text).toContain("Cash App: https://cash.app/$jake");
  });
});
