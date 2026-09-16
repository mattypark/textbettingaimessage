/**
 * apply_bet_transition against local Supabase: the optimistic version guard
 * must let exactly one of N concurrent accepts lock the bet.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { BetEngine } from "@/src/bets/engine";
import { SupabaseBetStore } from "@/src/bets/supabase-store";
import type { Bet } from "@/src/bets/types";
import { PointsLedger } from "@/src/ledger/points-ledger";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);
const uuid = () => crypto.randomUUID();
const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe.skipIf(!enabled)("apply_bet_transition (Postgres)", () => {
  let db: SupabaseClient;
  let store: SupabaseBetStore;
  let ledger: PointsLedger;
  let chatId: string;
  const users = { matt: uuid(), jake: uuid(), sam: uuid() };

  beforeAll(async () => {
    db = createClient(url ?? "", key ?? "", { auth: { persistSession: false } });
    store = new SupabaseBetStore(db);
    ledger = new PointsLedger(db);
    for (const [name, id] of Object.entries(users)) {
      await db.from("users").insert({ id, phone: `+1555${Math.floor(Math.random() * 1e7)}`, display_name: name });
      await ledger.grant({ userId: id, amount: 100n, idem: `grant:${id}` });
    }
    const { data } = await db.from("chats").insert({ provider: "fake", provider_chat_id: uuid(), is_group: true }).select("id").single();
    chatId = data!.id;
  });

  function makeBet(): Bet {
    return {
      id: uuid(),
      chatId,
      creatorId: users.matt,
      status: "proposed",
      claim: "integration bet",
      stake: { kind: "points", amount: 20n, currency: "PTS" },
      participants: [
        { userId: users.matt, side: "for", required: true, acceptedAt: new Date().toISOString() },
        { userId: users.jake, side: "against", required: true },
        { userId: users.sam, side: "against", required: true },
      ],
      proofCriteria: { summary: "photo", required: ["thing"], optional: [], challengeTokenRequired: true, mediaKinds: ["photo"] },
      judgeKind: "bot",
      createdAt: new Date().toISOString(),
      acceptByAt: hours(24),
      deadlineAt: hours(72),
      proofGraceHours: 12,
      noProofRule: "auto_loss",
      version: 0,
    };
  }

  it("round-trips a bet document with bigint stake", async () => {
    const bet = await store.create(makeBet());
    const loaded = await store.get(bet.id);
    expect(loaded?.stake.amount).toBe(20n);
    expect(loaded?.participants).toHaveLength(3);
  });

  it("locks exactly once under 10 concurrent accepts; holds land in the ledger", async () => {
    const bet = await store.create(makeBet());
    const posts: string[] = [];
    const engine = new BetEngine({ store, ledger, post: async (_c, m) => { posts.push(m.text); }, names: (id) => id.slice(0, 4) });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => engine.apply(bet.id, { type: "ACCEPT", userId: i % 2 ? users.jake : users.sam }))
    );
    const final = await store.get(bet.id);
    expect(final?.status).toBe("locked");
    expect(final?.version).toBe(2);
    expect(posts.filter((t) => t.startsWith("🔒 LOCKED"))).toHaveLength(1);
    const { data: events } = await db.from("bet_events").select("version, to_status, effects_completed_at").eq("bet_id", bet.id).order("version");
    expect(events?.map((e) => e.to_status)).toEqual(["proposed", "locked"]);
    expect(events?.every((e) => e.effects_completed_at)).toBe(true);
    expect((await ledger.wallet(users.jake)).held).toBeGreaterThanOrEqual(20n);
  });

  it("rejects a stale version at the database", async () => {
    const bet = await store.create(makeBet());
    const { data } = await db.rpc("apply_bet_transition", {
      p_bet_id: bet.id,
      p_expected_version: 7,
      p_next_state: { ...bet, status: "cancelled", version: 8, stake: { ...bet.stake, amount: "20" } },
      p_event: { type: "CANCEL", userId: users.matt },
      p_effects: [],
    });
    expect(data).toBe(false);
    expect((await store.get(bet.id))?.status).toBe("proposed");
  });
});
