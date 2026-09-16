import { NotLicensedError, type Ledger } from "./types";

/**
 * Placeholder for real-money stakes.
 *
 * Blocked on licensing. Holding user funds for wagers is (a) "advancing"
 * gambling under most state statutes even with no rake, (b) money
 * transmission in 49 states, and (c) barred by every consumer payment rail.
 * The realistic path is a licensed exchange partner acting as custodian
 * (see docs/legal-status.md). Until `LEGAL_CLEARANCE=1` and a `CASH_PARTNER`
 * exist, every method throws so nothing can accidentally move money.
 */
export class CashLedger implements Ledger {
  readonly kind = "cash" as const;
  readonly currency = "USD";

  async grant(): Promise<never> {
    throw new NotLicensedError();
  }
  async hold(): Promise<never> {
    throw new NotLicensedError();
  }
  async release(): Promise<never> {
    throw new NotLicensedError();
  }
  async settle(): Promise<never> {
    throw new NotLicensedError();
  }
  async bond(): Promise<never> {
    throw new NotLicensedError();
  }
  async resolveBond(): Promise<never> {
    throw new NotLicensedError();
  }
  async wallet(): Promise<never> {
    throw new NotLicensedError();
  }
}
