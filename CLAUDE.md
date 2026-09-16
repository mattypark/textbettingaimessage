# textbettingaimessage — working rules

Group-chat betting bot for iMessage. Plan of record:
`~/.claude/plans/me-and-my-friend-hazy-turtle.md` (verdict, legal findings, stages).

## Non-negotiables
- `STAKE_MODE=points` until legal clearance. Never wire a cash rail, never hold
  funds, never denominate points in USD with payment links. See `docs/legal-status.md`.
- Every reply goes through the outbox (`src/transport/outbox.ts`); never call
  `transport.send` directly from a handler.
- Sendblue: reply to `group_id`, never `from_number`.
- Attachments: download inside the webhook; provider URLs expire in 15 min.
- Money-shaped code (ledger, state machine) is not "done" until its property
  and RPC tests have run and been quoted.

## Stack
Next.js 16 App Router · Supabase (Postgres, Auth, Storage, pg_cron) · Claude
(`claude-opus-5` parse/judge, `claude-sonnet-5` classifier) · Linq primary,
Sendblue secondary, `TRANSPORT=fake` for tests.

## Commands
`npm test` · `npm run typecheck` · `npm run webhooks:dev` (Linq → localhost, no ngrok)

## Git
Commit after every real unit of work as Matthew Park. One initial push was
authorized on 2026-09-16; further pushes need a go-ahead.
