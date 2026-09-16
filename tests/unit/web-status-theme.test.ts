import { describe, expect, it } from "vitest";
import { BET_STATUSES, type Bet } from "@/src/bets/types";
import { portfolioMood, statusTheme, viewerOutcome } from "@/src/web/status-theme";

function bet(over: Partial<Bet>): Bet {
  return {
    id: "b1",
    chatId: "c1",
    creatorId: "me",
    status: "proposed",
    claim: "I make the shot",
    stake: { kind: "points", amount: 20n, currency: "PTS" },
    participants: [
      { userId: "me", side: "for", required: true },
      { userId: "jake", side: "against", required: true },
    ],
    proofCriteria: { summary: "video of the shot", required: ["ball goes in"], optional: [], challengeTokenRequired: true, mediaKinds: ["video"] },
    judgeKind: "bot",
    createdAt: "2026-09-01T00:00:00Z",
    acceptByAt: "2026-09-02T00:00:00Z",
    deadlineAt: "2026-09-05T00:00:00Z",
    proofGraceHours: 12,
    noProofRule: "auto_loss",
    version: 1,
    ...over,
  };
}

describe("statusTheme", () => {
  it("covers every bet status", () => {
    for (const status of BET_STATUSES) {
      const theme = statusTheme(status);
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.accent).toBeTruthy();
      expect(theme.mood).toBeTruthy();
    }
  });

  it("colours a settled bet by the viewer's outcome", () => {
    expect(statusTheme("settled", "won")).toMatchObject({ accent: "green", mood: "money", label: "you won" });
    expect(statusTheme("settled", "lost")).toMatchObject({ accent: "mist", mood: "sleep", label: "you lost" });
    expect(statusTheme("settled", null).accent).toBe("green");
  });
});

describe("viewerOutcome", () => {
  const settled = bet({ status: "settled", verdict: { outcome: "for", confidence: 0.9, pass: 1 } });
  it("reads the verdict against the viewer's side", () => {
    expect(viewerOutcome(settled, "me")).toBe("won");
    expect(viewerOutcome(settled, "jake")).toBe("lost");
    expect(viewerOutcome(settled, "stranger")).toBeNull();
  });
  it("is null before settlement", () => {
    expect(viewerOutcome(bet({ status: "locked" }), "me")).toBeNull();
  });
});

describe("portfolioMood", () => {
  const now = new Date("2026-09-10T00:00:00Z").getTime();
  it("refs when anything is being judged or disputed", () => {
    expect(portfolioMood([bet({ status: "disputed" }), bet({ status: "locked" })], "me", now)).toBe("ref");
  });
  it("counts money after a win this week", () => {
    const won = bet({ status: "settled", verdict: { outcome: "for", confidence: 0.9, pass: 1 }, resolvedAt: "2026-09-08T00:00:00Z" });
    expect(portfolioMood([won], "me", now)).toBe("money");
  });
  it("waves with open bets, sleeps with none", () => {
    expect(portfolioMood([bet({ status: "locked" })], "me", now)).toBe("wave");
    expect(portfolioMood([bet({ status: "expired" })], "me", now)).toBe("sleep");
    expect(portfolioMood([], "me", now)).toBe("sleep");
  });
});
