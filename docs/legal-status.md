# Legal status — read before touching money

**As of 2026-09-16: `STAKE_MODE=points` only. No cash.** Research summary and
citations live in the plan file (`~/.claude/plans/me-and-my-friend-hazy-turtle.md`,
section C). This is AI research, not legal advice; a gaming attorney reviews
before any money moves.

## Why cash is closed today
1. State law — "advances **or** profits from" gambling; holding stakes is
   advancing even with zero rake (NY PL §225.00). Social-gambling exemptions
   protect players, not platforms. Washington: internet wager info = felony.
2. Payments — Stripe, PayPal/Venmo, Cash App, Dwolla prohibit P2P betting by
   name. Holding funds = money transmitter in 49 states.
3. Distribution — App Store 5.3.4 requires licensure everywhere used.

## The path (ranked)
1. UX layer on a licensed exchange's B2B API (ProphetX / Novig / Kalshi):
   partner is custodian + licensee; cash bets limited to their event contracts.
2. DFS / skill-contest licence (Splash model) — wrong shape for custom bets.
3. Become a CFTC DCM — $5–20M, 12–24 months. No.

## Code gate
`STAKE_MODE=cash` refuses to boot unless `LEGAL_CLEARANCE=1` and
`CASH_PARTNER` are set. `CashLedger` throws `NotLicensedError` until then.
