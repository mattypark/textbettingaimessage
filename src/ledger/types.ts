/**
 * Stake abstraction. The bet engine calls these six operations and never
 * learns whether the units are points or dollars. Amounts are bigint minor
 * units (points are whole integers with currency "PTS").
 */
export type StakeKind = "points" | "social" | "cash";

export interface Stake {
  kind: StakeKind;
  amount: bigint;
  currency: string;
  /** Social stakes: "loser buys dinner". Amount is 0 but the audit trail is uniform. */
  description?: string;
}

export interface HoldRef {
  transactionId: string;
}

export interface Wallet {
  available: bigint;
  held: bigint;
  currency: string;
}

export interface Payout {
  userId: string;
  amount: bigint;
}

export interface Ledger {
  readonly kind: "points" | "cash";
  readonly currency: string;
  /** Credit a user from the house (onboarding grant, weekly allowance). */
  grant(p: { userId: string; amount: bigint; idem: string; memo?: string }): Promise<void>;
  /** Move a participant's stake into the bet's escrow. Rejects if insufficient. */
  hold(p: { betId: string; userId: string; stake: Stake; idem: string }): Promise<HoldRef>;
  /** Return every hold on a bet to its owner. */
  release(p: { betId: string; idem: string }): Promise<void>;
  /** Pay the bet's escrow out. Payouts must sum to the escrow balance exactly. */
  settle(p: { betId: string; payouts: Payout[]; idem: string }): Promise<void>;
  /** Post a dispute bond from a user. */
  bond(p: { betId: string; disputeId: string; userId: string; amount: bigint; idem: string }): Promise<HoldRef>;
  /** Forfeit the bond to `toUserId`, or release it back to the bonder. */
  resolveBond(p: { disputeId: string; outcome: "forfeit" | "release"; toUserId?: string; idem: string }): Promise<void>;
  wallet(userId: string): Promise<Wallet>;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: "insufficient" | "unbalanced" | "not_found" | "invalid"
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export class NotLicensedError extends Error {
  constructor() {
    super("CashLedger is not available: real-money stakes require legal clearance and a licensed partner. See docs/legal-status.md.");
    this.name = "NotLicensedError";
  }
}

/** Every posting: signed entries that sum to zero. Shared by memory and SQL ledgers. */
export interface Entry {
  account: AccountKey;
  amount: bigint;
}

export type OwnerType = "user" | "bet_escrow" | "dispute_bond" | "house";

export interface AccountKey {
  ownerType: OwnerType;
  ownerId: string;
}

export const HOUSE: AccountKey = { ownerType: "house", ownerId: "house" };
export const userAccount = (userId: string): AccountKey => ({ ownerType: "user", ownerId: userId });
export const escrowAccount = (betId: string): AccountKey => ({ ownerType: "bet_escrow", ownerId: betId });
export const bondAccount = (disputeId: string): AccountKey => ({ ownerType: "dispute_bond", ownerId: disputeId });

export function assertBalanced(entries: Entry[]): void {
  const total = entries.reduce((sum, e) => sum + e.amount, 0n);
  if (total !== 0n) throw new LedgerError(`entries sum to ${total}, expected 0`, "unbalanced");
  if (entries.length === 0) throw new LedgerError("no entries", "invalid");
}
