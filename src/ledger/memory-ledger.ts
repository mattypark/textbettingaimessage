import {
  assertBalanced,
  bondAccount,
  escrowAccount,
  HOUSE,
  LedgerError,
  userAccount,
  type AccountKey,
  type Entry,
  type HoldRef,
  type Ledger,
  type Payout,
  type Stake,
  type Wallet,
} from "./types";

type TxnKind = "grant" | "hold" | "release" | "settle" | "bond" | "bond_forfeit" | "bond_release";

interface Txn {
  id: string;
  kind: TxnKind;
  idem: string;
  betId?: string;
  disputeId?: string;
  userId?: string;
  entries: Entry[];
}

const key = (a: AccountKey) => `${a.ownerType}:${a.ownerId}`;

/**
 * Reference ledger: in-memory double-entry with the same invariants the SQL
 * functions enforce. Used by unit/property tests and the replay harness;
 * `PointsLedger` must behave identically against Postgres.
 */
export class MemoryLedger implements Ledger {
  readonly kind = "points" as const;
  readonly currency = "PTS";
  readonly txns: Txn[] = [];
  private readonly byIdem = new Map<string, Txn>();
  private readonly balances = new Map<string, bigint>();
  private seq = 0;

  balance(account: AccountKey): bigint {
    return this.balances.get(key(account)) ?? 0n;
  }

  private post(kind: TxnKind, idem: string, entries: Entry[], meta: Partial<Txn> = {}): Txn {
    const existing = this.byIdem.get(idem);
    if (existing) return existing;
    assertBalanced(entries);
    for (const entry of entries) {
      if (entry.account.ownerType === "user" && this.balance(entry.account) + entry.amount < 0n) {
        throw new LedgerError(`insufficient balance for ${entry.account.ownerId}`, "insufficient");
      }
    }
    for (const entry of entries) {
      this.balances.set(key(entry.account), this.balance(entry.account) + entry.amount);
    }
    const txn: Txn = { id: `txn-${++this.seq}`, kind, idem, entries, ...meta };
    this.txns.push(txn);
    this.byIdem.set(idem, txn);
    return txn;
  }

  async grant({ userId, amount, idem }: { userId: string; amount: bigint; idem: string }): Promise<void> {
    if (amount <= 0n) throw new LedgerError("grant must be positive", "invalid");
    this.post("grant", idem, [
      { account: HOUSE, amount: -amount },
      { account: userAccount(userId), amount },
    ], { userId });
  }

  async hold({ betId, userId, stake, idem }: { betId: string; userId: string; stake: Stake; idem: string }): Promise<HoldRef> {
    if (stake.amount < 0n) throw new LedgerError("negative stake", "invalid");
    const txn = this.post("hold", idem, [
      { account: userAccount(userId), amount: -stake.amount },
      { account: escrowAccount(betId), amount: stake.amount },
    ], { betId, userId });
    return { transactionId: txn.id };
  }

  private holdsFor(betId: string): Txn[] {
    return this.txns.filter((t) => t.kind === "hold" && t.betId === betId);
  }

  async release({ betId, idem }: { betId: string; idem: string }): Promise<void> {
    const entries: Entry[] = this.holdsFor(betId).flatMap((hold) =>
      hold.entries.map((e) => ({ account: e.account, amount: -e.amount }))
    );
    if (entries.length === 0) return;
    this.post("release", idem, entries, { betId });
  }

  async settle({ betId, payouts, idem }: { betId: string; payouts: Payout[]; idem: string }): Promise<void> {
    const escrow = escrowAccount(betId);
    const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
    if (total !== this.balance(escrow)) {
      throw new LedgerError(`payouts ${total} != escrow ${this.balance(escrow)}`, "unbalanced");
    }
    if (payouts.some((p) => p.amount < 0n)) throw new LedgerError("negative payout", "invalid");
    if (total === 0n) return;
    this.post("settle", idem, [
      { account: escrow, amount: -total },
      ...payouts.map((p) => ({ account: userAccount(p.userId), amount: p.amount })),
    ], { betId });
  }

  async bond({ betId, disputeId, userId, amount, idem }: { betId: string; disputeId: string; userId: string; amount: bigint; idem: string }): Promise<HoldRef> {
    if (amount <= 0n) throw new LedgerError("bond must be positive", "invalid");
    const txn = this.post("bond", idem, [
      { account: userAccount(userId), amount: -amount },
      { account: bondAccount(disputeId), amount },
    ], { betId, disputeId, userId });
    return { transactionId: txn.id };
  }

  async resolveBond({ disputeId, outcome, toUserId, idem }: { disputeId: string; outcome: "forfeit" | "release"; toUserId?: string; idem: string }): Promise<void> {
    const bond = this.txns.find((t) => t.kind === "bond" && t.disputeId === disputeId);
    if (!bond?.userId) throw new LedgerError(`no bond for dispute ${disputeId}`, "not_found");
    const amount = this.balance(bondAccount(disputeId));
    if (amount === 0n) return;
    const recipient = outcome === "forfeit" ? toUserId : bond.userId;
    if (!recipient) throw new LedgerError("forfeit needs toUserId", "invalid");
    this.post(outcome === "forfeit" ? "bond_forfeit" : "bond_release", idem, [
      { account: bondAccount(disputeId), amount: -amount },
      { account: userAccount(recipient), amount },
    ], { disputeId });
  }

  async wallet(userId: string): Promise<Wallet> {
    let held = 0n;
    for (const txn of this.txns) {
      if ((txn.kind === "hold" || txn.kind === "bond") && txn.userId === userId) {
        const pool = txn.kind === "hold" ? escrowAccount(txn.betId!) : bondAccount(txn.disputeId!);
        // A hold still counts only while its pool has not been drained.
        if (this.balance(pool) > 0n) held += txn.entries.find((e) => e.account.ownerType !== "user")!.amount;
      }
    }
    return { available: this.balance(userAccount(userId)), held, currency: this.currency };
  }
}
