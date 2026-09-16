/**
 * Runs against a local Supabase (`supabase start`). Verifies that the
 * database — not the TypeScript — enforces the ledger invariants.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... npm run test:integration
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { PointsLedger } from "@/src/ledger/points-ledger";
import { LedgerError } from "@/src/ledger/types";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

const uuid = () => crypto.randomUUID();

describe.skipIf(!enabled)("post_ledger_txn (Postgres)", () => {
  let db: SupabaseClient;
  let ledger: PointsLedger;
  const a = uuid();
  const b = uuid();

  beforeAll(async () => {
    db = createClient(url ?? "", key ?? "", { auth: { persistSession: false } });
    ledger = new PointsLedger(db);
    await ledger.grant({ userId: a, amount: 100n, idem: `grant:${a}` });
    await ledger.grant({ userId: b, amount: 100n, idem: `grant:${b}` });
  });

  it("rejects an unbalanced posting at the database", async () => {
    const { error } = await db.rpc("post_ledger_txn", {
      p_kind: "adjust",
      p_entries: [{ owner_type: "user", owner_id: a, amount: "5" }],
      p_idempotency_key: `unbalanced:${uuid()}`,
    });
    expect(error?.message).toMatch(/sum to 5/);
  });

  it("rejects a hold the user cannot cover", async () => {
    await expect(
      ledger.hold({ betId: uuid(), userId: a, stake: { kind: "points", amount: 500n, currency: "PTS" }, idem: `big:${uuid()}` })
    ).rejects.toMatchObject({ code: "insufficient" });
  });

  it("holds, settles, and is idempotent", async () => {
    const bet = uuid();
    const idem = `hold:${bet}:${a}`;
    await ledger.hold({ betId: bet, userId: a, stake: { kind: "points", amount: 20n, currency: "PTS" }, idem });
    await ledger.hold({ betId: bet, userId: a, stake: { kind: "points", amount: 20n, currency: "PTS" }, idem });
    await ledger.hold({ betId: bet, userId: b, stake: { kind: "points", amount: 20n, currency: "PTS" }, idem: `hold:${bet}:${b}` });
    expect((await ledger.wallet(a)).held).toBe(20n);

    await ledger.settle({ betId: bet, payouts: [{ userId: b, amount: 40n }], idem: `settle:${bet}` });
    const wa = await ledger.wallet(a);
    const wb = await ledger.wallet(b);
    expect(wa.held).toBe(0n);
    expect(wb.available - wa.available).toBe(40n);
  });

  it("refuses to update or delete entries", async () => {
    const { data } = await db.from("ledger_entries").select("id").limit(1).single();
    const { error } = await db.from("ledger_entries").delete().eq("id", data?.id ?? "");
    expect(error?.message).toMatch(/append-only/);
  });

  it("surfaces LedgerError with a code", async () => {
    await expect(ledger.settle({ betId: uuid(), payouts: [{ userId: a, amount: 1n }], idem: `s:${uuid()}` })).rejects.toBeInstanceOf(LedgerError);
  });
});
