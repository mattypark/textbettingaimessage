import type { SupabaseClient } from "@supabase/supabase-js";
import {
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

interface PoolEntry {
  txn_id: string;
  user_id: string | null;
  owner_type: AccountKey["ownerType"];
  owner_id: string;
  amount: number | string;
}

function toJson(entries: Entry[]) {
  return entries.map((e) => ({ owner_type: e.account.ownerType, owner_id: e.account.ownerId, amount: e.amount.toString() }));
}

function mapError(context: string, error: { message: string; code?: string }): LedgerError {
  const message = `${context}: ${error.message}`;
  if (/insufficient balance/i.test(error.message)) return new LedgerError(message, "insufficient");
  if (/unbalanced|sum to/i.test(error.message)) return new LedgerError(message, "unbalanced");
  return new LedgerError(message, "invalid");
}

/**
 * Points ledger on Postgres. Every operation is one `post_ledger_txn` call, so
 * the sum-to-zero, non-negative and idempotency rules are enforced by the
 * database, not by this file.
 */
export class PointsLedger implements Ledger {
  readonly kind = "points" as const;
  readonly currency = "PTS";

  constructor(private readonly db: SupabaseClient) {}

  private async post(
    kind: TxnKind,
    entries: Entry[],
    idem: string,
    meta: { betId?: string; disputeId?: string; userId?: string; memo?: string } = {}
  ): Promise<string> {
    const { data, error } = await this.db.rpc("post_ledger_txn", {
      p_kind: kind,
      p_entries: toJson(entries),
      p_idempotency_key: idem,
      p_bet_id: meta.betId ?? null,
      p_dispute_id: meta.disputeId ?? null,
      p_user_id: meta.userId ?? null,
      p_memo: meta.memo ?? null,
      p_currency: this.currency,
    });
    if (error) throw mapError(`post_ledger_txn(${kind})`, error);
    return data as string;
  }

  private async balance(account: AccountKey): Promise<bigint> {
    const { data, error } = await this.db.rpc("account_balance", {
      p_owner_type: account.ownerType,
      p_owner_id: account.ownerId,
      p_currency: this.currency,
    });
    if (error) throw mapError("account_balance", error);
    return BigInt(data as number | string);
  }

  private async poolEntries(kind: "hold" | "bond", betId?: string, disputeId?: string): Promise<PoolEntry[]> {
    const { data, error } = await this.db.rpc("ledger_pool_entries", {
      p_kind: kind,
      p_bet_id: betId ?? null,
      p_dispute_id: disputeId ?? null,
    });
    if (error) throw mapError("ledger_pool_entries", error);
    return (data ?? []) as PoolEntry[];
  }

  async grant({ userId, amount, idem, memo }: { userId: string; amount: bigint; idem: string; memo?: string }): Promise<void> {
    if (amount <= 0n) throw new LedgerError("grant must be positive", "invalid");
    await this.post("grant", [
      { account: HOUSE, amount: -amount },
      { account: userAccount(userId), amount },
    ], idem, { userId, memo });
  }

  async hold({ betId, userId, stake, idem }: { betId: string; userId: string; stake: Stake; idem: string }): Promise<HoldRef> {
    if (stake.amount < 0n) throw new LedgerError("negative stake", "invalid");
    const transactionId = await this.post("hold", [
      { account: userAccount(userId), amount: -stake.amount },
      { account: escrowAccount(betId), amount: stake.amount },
    ], idem, { betId, userId, memo: stake.description });
    return { transactionId };
  }

  async release({ betId, idem }: { betId: string; idem: string }): Promise<void> {
    const holds = await this.poolEntries("hold", betId);
    if (holds.length === 0) return;
    const entries: Entry[] = holds.map((row) => ({
      account: { ownerType: row.owner_type, ownerId: row.owner_id },
      amount: -BigInt(row.amount),
    }));
    await this.post("release", entries, idem, { betId });
  }

  async settle({ betId, payouts, idem }: { betId: string; payouts: Payout[]; idem: string }): Promise<void> {
    const escrow = escrowAccount(betId);
    const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
    const held = await this.balance(escrow);
    if (total !== held) throw new LedgerError(`payouts ${total} != escrow ${held}`, "unbalanced");
    if (payouts.some((p) => p.amount < 0n)) throw new LedgerError("negative payout", "invalid");
    if (total === 0n) return;
    await this.post("settle", [
      { account: escrow, amount: -total },
      ...payouts.map((p) => ({ account: userAccount(p.userId), amount: p.amount })),
    ], idem, { betId });
  }

  async bond({ betId, disputeId, userId, amount, idem }: { betId: string; disputeId: string; userId: string; amount: bigint; idem: string }): Promise<HoldRef> {
    if (amount <= 0n) throw new LedgerError("bond must be positive", "invalid");
    const transactionId = await this.post("bond", [
      { account: userAccount(userId), amount: -amount },
      { account: bondAccount(disputeId), amount },
    ], idem, { betId, disputeId, userId });
    return { transactionId };
  }

  async resolveBond({ disputeId, outcome, toUserId, idem }: { disputeId: string; outcome: "forfeit" | "release"; toUserId?: string; idem: string }): Promise<void> {
    const bonds = await this.poolEntries("bond", undefined, disputeId);
    const bonder = bonds.find((row) => row.user_id)?.user_id;
    if (!bonder) throw new LedgerError(`no bond for dispute ${disputeId}`, "not_found");
    const amount = await this.balance(bondAccount(disputeId));
    if (amount === 0n) return;
    const recipient = outcome === "forfeit" ? toUserId : bonder;
    if (!recipient) throw new LedgerError("forfeit needs toUserId", "invalid");
    await this.post(outcome === "forfeit" ? "bond_forfeit" : "bond_release", [
      { account: bondAccount(disputeId), amount: -amount },
      { account: userAccount(recipient), amount },
    ], idem, { disputeId });
  }

  async wallet(userId: string): Promise<Wallet> {
    const available = await this.balance(userAccount(userId));
    const { data, error } = await this.db.rpc("user_held_balance", { p_user_id: userId, p_currency: this.currency });
    if (error) throw mapError("user_held_balance", error);
    return { available, held: BigInt((data as number | string | null) ?? 0), currency: this.currency };
  }
}
