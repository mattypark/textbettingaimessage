import { describe, expect, it } from "vitest";
import type { Bet } from "@/src/bets/types";
import { fundingPayoutText, fundingRequestText, fundingStatusText } from "@/src/settle/funding";

const bet = (funding: Bet["funding"], outcome?: "for" | "against"): Bet => ({
  id: "abcdef0123",
  chatId: "c",
  creatorId: "matt",
  status: outcome ? "settled" : "locked",
  claim: "I beat Jake 1v1",
  stake: { kind: "social", amount: 0n, currency: "PTS", description: "$20 each" },
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
  funding,
  ...(outcome ? { verdict: { outcome, confidence: 0.9, pass: 1 } } : {}),
  version: 3,
});
const name = (id: string) => id[0].toUpperCase() + id.slice(1);
const handles = async (id: string) => (id === "sam" ? { venmo: "sam-holds" } : id === "matt" ? { cashapp: "matt" } : {});

describe("funded bets", () => {
  it("asks both bettors to pay the holder with the holder's links", async () => {
    const text = await fundingRequestText({ bet: bet({ holderUserId: "sam", amountUsd: 20, paid: {} }), name, handlesOf: handles });
    expect(text).toContain("$20 each, $40 pot — Sam's holding it");
    expect(text).toContain("Matt + Jake → send Sam $20:");
    expect(text).toContain("Venmo: https://venmo.com/sam-holds?txn=pay&amount=20");
    expect(text).toContain('Sam says "got it"');
  });

  it("tallies who paid, then flips to pot-full once the holder confirms", () => {
    expect(fundingStatusText(bet({ holderUserId: "sam", amountUsd: 20, paid: { matt: "t" } }), name)).toBe("Matt paid (1/2) — waiting on Jake");
    expect(fundingStatusText(bet({ holderUserId: "sam", amountUsd: 20, paid: { matt: "t", jake: "t" } }), name)).toBe('Matt, Jake paid (2/2) — Sam say "got it"');
    expect(fundingStatusText(bet({ holderUserId: "sam", amountUsd: 20, paid: { matt: "t", jake: "t" }, confirmedAt: "t" }), name)).toContain("pot's full — $40 with Sam");
  });

  it("after the verdict tells the holder to pay the winner the whole pot", async () => {
    const text = await fundingPayoutText({ bet: bet({ holderUserId: "sam", amountUsd: 20, paid: {}, confirmedAt: "t" }, "for"), name, handlesOf: handles });
    expect(text).toContain("Sam, pay it out — $40 pot:");
    expect(text).toContain("→ Matt $40");
    expect(text).toContain("Cash App: https://cash.app/$matt/40");
  });

  it("returns nothing for bets without funding", async () => {
    expect(await fundingRequestText({ bet: bet(undefined), name, handlesOf: handles })).toBeNull();
    expect(await fundingPayoutText({ bet: bet(undefined, "for"), name, handlesOf: handles })).toBeNull();
  });
});
