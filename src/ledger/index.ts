import { env } from "@/src/config/env";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/src/db/admin";
import { CashLedger } from "./cash-ledger";
import { MemoryLedger } from "./memory-ledger";
import { PointsLedger } from "./points-ledger";
import type { Ledger } from "./types";

export type { Ledger, Stake, Wallet, Payout, HoldRef } from "./types";
export { LedgerError, NotLicensedError } from "./types";

let instance: Ledger | undefined;

/**
 * Ledger for `STAKE_MODE`. Cash refuses to boot without explicit clearance so
 * a misconfigured deploy fails loudly rather than quietly holding money.
 */
export function createLedger(): Ledger {
  if (instance) return instance;
  const { STAKE_MODE, LEGAL_CLEARANCE, CASH_PARTNER } = env();
  if (STAKE_MODE === "cash") {
    if (LEGAL_CLEARANCE !== "1" || !CASH_PARTNER) {
      throw new Error("STAKE_MODE=cash requires LEGAL_CLEARANCE=1 and CASH_PARTNER. See docs/legal-status.md.");
    }
    instance = new CashLedger();
    return instance;
  }
  instance = isSupabaseAdminConfigured() ? new PointsLedger(supabaseAdmin()) : new MemoryLedger();
  return instance;
}

/** Test hook. */
export function resetLedger(): void {
  instance = undefined;
}
