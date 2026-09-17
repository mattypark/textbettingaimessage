import { describe, expect, it } from "vitest";
import { runReminders } from "@/src/bets/reminders";
import { MemoryBetStore } from "@/src/bets/store";
import type { Bet } from "@/src/bets/types";

const T0 = new Date("2026-09-17T12:00:00Z");
const bet = (id: string, deadlineInMin: number, status: Bet["status"] = "locked"): Bet => ({
  id,
  chatId: "c",
  creatorId: "matt",
  status,
  claim: "I make the shot",
  stake: { kind: "points", amount: 20n, currency: "PTS" },
  participants: [
    { userId: "matt", side: "for", required: true },
    { userId: "jake", side: "against", required: true },
  ],
  proofCriteria: { summary: "s", required: ["r"], optional: [], challengeTokenRequired: true, mediaKinds: ["photo"] },
  judgeKind: "bot",
  createdAt: T0.toISOString(),
  acceptByAt: T0.toISOString(),
  deadlineAt: new Date(T0.getTime() + deadlineInMin * 60_000).toISOString(),
  proofGraceHours: 12,
  noProofRule: "auto_loss",
  version: 2,
});

describe("runReminders", () => {
  it("nudges the side that owes proof once, within the window, locked bets only", async () => {
    const store = new MemoryBetStore();
    await store.create(bet("soon", 90));
    await store.create(bet("later", 300));
    await store.create(bet("past", -10));
    await store.create(bet("proposed", 60, "proposed"));
    const posts: Array<{ chatId: string; text: string; key: string }> = [];
    const deps = { store, post: async (chatId: string, m: { text: string }, key: string) => void posts.push({ chatId, text: m.text, key }), namesFor: async () => (id: string) => id.toUpperCase() };

    expect(await runReminders(deps, T0)).toBe(1);
    expect(posts).toHaveLength(1);
    expect(posts[0].key).toBe("bet:soon:remind");
    expect(posts[0].text).toMatch(/^⏰ #soon — proof due .* \(90 min left\)\nMATT don't take the L/);

    // Second tick: nothing repeats.
    expect(await runReminders(deps, new Date(T0.getTime() + 60_000))).toBe(0);
    expect((await store.get("soon"))?.reminderSentAt).toBe(T0.toISOString());
  });
});
