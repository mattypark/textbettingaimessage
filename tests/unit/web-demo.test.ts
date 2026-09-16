import { describe, expect, it } from "vitest";
import { BET_STATUSES, ProofCriteriaSchema } from "@/src/bets/types";
import { isWebDemo } from "@/src/web/demo/flag";
import { DEMO_BETS, DEMO_BET_IDS, DEMO_CHATS, DEMO_PROOFS, DEMO_USERS, DEMO_USER_ID, DEMO_VERDICTS, demoEvents } from "@/src/web/demo/seed";
import { DemoWebData } from "@/src/web/demo/store";
import { rankChat } from "@/src/web/leaderboard";

describe("isWebDemo", () => {
  it("is on only with WEB_DEMO=1 and nothing real around", () => {
    expect(isWebDemo({ WEB_DEMO: "1" })).toBe(true);
    expect(isWebDemo({})).toBe(false);
    expect(isWebDemo({ WEB_DEMO: "true" })).toBe(false);
  });
  it("refuses on Vercel", () => {
    expect(isWebDemo({ WEB_DEMO: "1", VERCEL: "1" })).toBe(false);
    expect(isWebDemo({ WEB_DEMO: "1", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("refuses when Supabase is configured", () => {
    expect(isWebDemo({ WEB_DEMO: "1", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBe(false);
    expect(isWebDemo({ WEB_DEMO: "1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" })).toBe(false);
  });
});

describe("demo seed", () => {
  it("only uses real statuses, bigint stakes and valid proof criteria", () => {
    for (const bet of DEMO_BETS) {
      expect(BET_STATUSES).toContain(bet.status);
      expect(typeof bet.stake.amount).toBe("bigint");
      expect(() => ProofCriteriaSchema.parse(bet.proofCriteria)).not.toThrow();
      expect(DEMO_CHATS.some((c) => c.id === bet.chatId)).toBe(true);
      for (const p of bet.participants) expect(DEMO_USERS.some((u) => u.id === p.userId)).toBe(true);
    }
  });
  it("has unique ids and the viewer on every bet", () => {
    expect(new Set(DEMO_BETS.map((b) => b.id)).size).toBe(DEMO_BETS.length);
    for (const bet of DEMO_BETS) expect(bet.participants.some((p) => p.userId === DEMO_USER_ID)).toBe(true);
  });
  it("pairs every verdict with a proof and a settled/posted status", () => {
    for (const [id, verdict] of Object.entries(DEMO_VERDICTS)) {
      const bet = DEMO_BETS.find((b) => b.id === id)!;
      expect(["verdict_posted", "disputed", "settled"]).toContain(bet.status);
      expect(bet.verdict?.outcome).toBe(verdict.outcome);
      expect(DEMO_PROOFS[id]?.length ?? 0).toBeGreaterThan(0);
    }
  });
  it("gives every bet an event trail ending in its status", () => {
    for (const bet of DEMO_BETS) {
      const trail = demoEvents(bet.id);
      expect(trail.length).toBeGreaterThan(0);
      expect(trail.at(-1)?.toStatus).toBe(bet.status);
    }
  });
});

describe("DemoWebData", () => {
  const data = new DemoWebData();
  it("serves detail, missing ids and the leaderboard", async () => {
    expect(await data.betDetail("nope")).toBeNull();
    const won = await data.betDetail(DEMO_BET_IDS.won);
    expect(won?.verdict?.outcome).toBe("for");
    expect(won?.proofs[0]?.mediaUrl).toMatch(/^\/demo\//);
    expect(await data.leaderboard("nope")).toBeNull();
  });
});

describe("rankChat", () => {
  it("nets settled points per member and orders by points, then honor", () => {
    const boys = DEMO_CHATS[0].id;
    const rows = rankChat(
      DEMO_BETS.filter((b) => b.chatId === boys),
      DEMO_USERS.map((u) => ({ id: u.id, name: u.name, honor: u.honor })),
      DEMO_USER_ID,
    );
    expect(rows.map((r) => r.name)).toEqual(["Matt", "Priya", "Sam", "Dev", "Jake"]);
    const matt = rows[0];
    expect(matt.isViewer).toBe(true);
    expect(matt.netPoints).toBe(25n);
    expect(matt.wins).toBe(1);
    expect(rows.find((r) => r.name === "Jake")?.netPoints).toBe(-25n);
  });
  it("counts social stakes as a record only", () => {
    const social = DEMO_BETS.find((b) => b.id === DEMO_BET_IDS.expired)!;
    const settled = { ...social, status: "settled" as const, verdict: { outcome: "for" as const, confidence: 0.9, pass: 1 as const } };
    const rows = rankChat([settled], [], DEMO_USER_ID);
    const sam = rows.find((r) => r.userId === social.creatorId)!;
    expect(sam.wins).toBe(1);
    expect(sam.netPoints).toBe(0n);
  });
});
