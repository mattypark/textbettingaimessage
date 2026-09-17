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

## Settle-up links (added 2026-09-17, Matthew's call)
Matthew asked for "Apple Wallet or something" so friends can actually pay.
What ships: after a **social** stake settles, the bot posts links that open
the loser's own Venmo / Cash App / PayPal pointed at the winner, with the
dollar amount the friends themselves wrote ("$20 loser pays"). Apple Cash has
no URL scheme or API, so it is an instruction ("send it in this thread").
Handles are set with `!pay venmo @you` or by telling the bot.

Why this stays on the right side of the wall above:
- We never hold, move, receive, or charge money. No payment API keys, no
  webhooks, no balances in dollars. Same shape as Splitwise's "settle up".
- Points stakes never get a link (`CLAUDE.md`: no USD-denominated points).
- The wager itself is a private social bet between friends; the link only
  saves typing the amount.

Open item for the attorney: Venmo/PayPal/Cash App terms bar *their* users
from gambling payments — the risk sits with the payer, but a platform that
prefills the amount could be argued to facilitate. `SETTLE_UP=0` turns it off
in one env var if counsel says so.

## Holder-funded stakes (added 2026-09-17, Matthew's call)
Matthew asked for money in up front ("Apple Wallet link, enter your card,
winner gets it all"). Card collection with us as custodian is exactly the
closed path above (and Stripe / Apple Pay list gambling as prohibited and
freeze funds). What ships instead: **a friend in the chat holds the pot.**
On "$20 each, sam holds it" the bot posts links for each bettor to pay Sam
through their own app, tallies "paid", takes Sam's "got it", judges the
proof, then hands Sam one link to pay the winner the pot. `bets.state.funding`
carries `{ holderUserId, amountUsd, paid, confirmedAt }`; points never move
for these bets. Same guarantee: no payment API keys, no balances in dollars,
no money through us. `SETTLE_UP=0` disables both this and the settle-up links.

