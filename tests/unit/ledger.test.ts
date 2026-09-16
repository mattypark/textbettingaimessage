import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CashLedger } from "@/src/ledger/cash-ledger";
import { MemoryLedger } from "@/src/ledger/memory-ledger";
import { escrowAccount, HOUSE, LedgerError, NotLicensedError, userAccount, type Stake } from "@/src/ledger/types";

const pts = (amount: bigint): Stake => ({ kind: "points", amount, currency: "PTS" });

async function funded(users: string[], amount = 100n) {
  const ledger = new MemoryLedger();
  for (const u of users) await ledger.grant({ userId: u, amount, idem: `grant:${u}` });
  return ledger;
}

describe("MemoryLedger — bet lifecycle", () => {
  it("hold → settle pays the winner the whole pot", async () => {
    const ledger = await funded(["a", "b"]);
    await ledger.hold({ betId: "bet1", userId: "a", stake: pts(20n), idem: "h:a" });
    await ledger.hold({ betId: "bet1", userId: "b", stake: pts(20n), idem: "h:b" });
    expect(await ledger.wallet("a")).toEqual({ available: 80n, held: 20n, currency: "PTS" });
    await ledger.settle({ betId: "bet1", payouts: [{ userId: "a", amount: 40n }], idem: "s:1" });
    expect((await ledger.wallet("a")).available).toBe(120n);
    expect((await ledger.wallet("a")).held).toBe(0n);
    expect((await ledger.wallet("b")).available).toBe(80n);
    expect(ledger.balance(escrowAccount("bet1"))).toBe(0n);
  });

  it("hold → release returns every stake", async () => {
    const ledger = await funded(["a", "b", "c"]);
    for (const u of ["a", "b", "c"]) await ledger.hold({ betId: "bet1", userId: u, stake: pts(10n), idem: `h:${u}` });
    await ledger.release({ betId: "bet1", idem: "r:1" });
    for (const u of ["a", "b", "c"]) expect((await ledger.wallet(u)).available).toBe(100n);
  });

  it("rejects a hold the user cannot cover", async () => {
    const ledger = await funded(["a"], 5n);
    await expect(ledger.hold({ betId: "bet1", userId: "a", stake: pts(20n), idem: "h" })).rejects.toMatchObject({ code: "insufficient" });
    expect((await ledger.wallet("a")).available).toBe(5n);
  });

  it("rejects a settle that does not match escrow", async () => {
    const ledger = await funded(["a", "b"]);
    await ledger.hold({ betId: "bet1", userId: "a", stake: pts(20n), idem: "h:a" });
    await expect(ledger.settle({ betId: "bet1", payouts: [{ userId: "a", amount: 30n }], idem: "s" })).rejects.toBeInstanceOf(LedgerError);
    await expect(ledger.settle({ betId: "bet1", payouts: [{ userId: "a", amount: 10n }], idem: "s" })).rejects.toBeInstanceOf(LedgerError);
  });

  it("social stakes flow through with amount 0 and touch nothing", async () => {
    const ledger = await funded(["a"]);
    await ledger.hold({ betId: "bet1", userId: "a", stake: { kind: "social", amount: 0n, currency: "PTS", description: "loser buys dinner" }, idem: "h" });
    expect(await ledger.wallet("a")).toEqual({ available: 100n, held: 0n, currency: "PTS" });
    await ledger.settle({ betId: "bet1", payouts: [], idem: "s" });
  });

  it("bond forfeits to the winner or releases to the bonder", async () => {
    const forfeit = await funded(["a", "b"]);
    await forfeit.bond({ betId: "bet1", disputeId: "d1", userId: "a", amount: 10n, idem: "b" });
    expect((await forfeit.wallet("a")).held).toBe(10n);
    await forfeit.resolveBond({ disputeId: "d1", outcome: "forfeit", toUserId: "b", idem: "rb" });
    expect((await forfeit.wallet("a")).available).toBe(90n);
    expect((await forfeit.wallet("b")).available).toBe(110n);

    const release = await funded(["a"]);
    await release.bond({ betId: "bet1", disputeId: "d1", userId: "a", amount: 10n, idem: "b" });
    await release.resolveBond({ disputeId: "d1", outcome: "release", idem: "rb" });
    expect((await release.wallet("a")).available).toBe(100n);
  });

  it("is idempotent on every operation", async () => {
    const ledger = await funded(["a", "b"]);
    await ledger.hold({ betId: "bet1", userId: "a", stake: pts(20n), idem: "h" });
    await ledger.hold({ betId: "bet1", userId: "a", stake: pts(20n), idem: "h" });
    expect((await ledger.wallet("a")).available).toBe(80n);
    await ledger.release({ betId: "bet1", idem: "r" });
    await ledger.release({ betId: "bet1", idem: "r" });
    expect((await ledger.wallet("a")).available).toBe(100n);
    expect(ledger.txns).toHaveLength(4); // 2 grants + 1 hold + 1 release
  });
});

describe("MemoryLedger — invariants under random operation sequences", () => {
  const users = ["u1", "u2", "u3"];

  type Op =
    | { op: "hold"; bet: string; user: string; amount: bigint }
    | { op: "release"; bet: string }
    | { op: "settle"; bet: string; winner: string }
    | { op: "bond"; dispute: string; user: string; amount: bigint }
    | { op: "resolveBond"; dispute: string; outcome: "forfeit" | "release"; to: string };

  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ op: fc.constant("hold" as const), bet: fc.constantFrom("b1", "b2"), user: fc.constantFrom(...users), amount: fc.bigInt(0n, 60n) }),
    fc.record({ op: fc.constant("release" as const), bet: fc.constantFrom("b1", "b2") }),
    fc.record({ op: fc.constant("settle" as const), bet: fc.constantFrom("b1", "b2"), winner: fc.constantFrom(...users) }),
    fc.record({ op: fc.constant("bond" as const), dispute: fc.constantFrom("d1", "d2"), user: fc.constantFrom(...users), amount: fc.bigInt(1n, 30n) }),
    fc.record({ op: fc.constant("resolveBond" as const), dispute: fc.constantFrom("d1", "d2"), outcome: fc.constantFrom("forfeit" as const, "release" as const), to: fc.constantFrom(...users) })
  );

  it("never goes negative, always sums to zero, conserves total points", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { maxLength: 40 }), async (ops) => {
        const ledger = await funded(users, 50n);
        let idem = 0;
        for (const step of ops) {
          const key = `op:${++idem}`;
          try {
            if (step.op === "hold") await ledger.hold({ betId: step.bet, userId: step.user, stake: pts(step.amount), idem: key });
            else if (step.op === "release") await ledger.release({ betId: step.bet, idem: key });
            else if (step.op === "settle") {
              const pot = ledger.balance(escrowAccount(step.bet));
              await ledger.settle({ betId: step.bet, payouts: pot > 0n ? [{ userId: step.winner, amount: pot }] : [], idem: key });
            } else if (step.op === "bond") await ledger.bond({ betId: "b1", disputeId: step.dispute, userId: step.user, amount: step.amount, idem: key });
            else await ledger.resolveBond({ disputeId: step.dispute, outcome: step.outcome, toUserId: step.to, idem: key });
          } catch (error) {
            if (!(error instanceof LedgerError)) throw error;
          }
          // Invariants after every step.
          for (const u of users) expect(ledger.balance(userAccount(u))).toBeGreaterThanOrEqual(0n);
          for (const txn of ledger.txns) expect(txn.entries.reduce((s, e) => s + e.amount, 0n)).toBe(0n);
        }
        // House issued 150; users + pools must hold exactly 150.
        let inSystem = 0n;
        for (const u of users) inSystem += ledger.balance(userAccount(u));
        for (const b of ["b1", "b2"]) inSystem += ledger.balance(escrowAccount(b));
        for (const d of ["d1", "d2"]) inSystem += ledger.balance({ ownerType: "dispute_bond", ownerId: d });
        expect(inSystem).toBe(150n);
        expect(ledger.balance(HOUSE)).toBe(-150n);
      }),
      { numRuns: 300 }
    );
  });
});

describe("CashLedger", () => {
  it("refuses every operation until licensed", async () => {
    const ledger = new CashLedger();
    await expect(ledger.wallet()).rejects.toBeInstanceOf(NotLicensedError);
    await expect(ledger.hold()).rejects.toBeInstanceOf(NotLicensedError);
  });
});
