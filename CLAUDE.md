# textbettingaimessage — working rules

Group-chat betting bot for iMessage. Plan of record:
`~/.claude/plans/me-and-my-friend-hazy-turtle.md` (verdict, legal findings, stages).

## Non-negotiables
- `STAKE_MODE=points` until legal clearance. Never wire a cash rail, never hold
  funds, never denominate points in USD with payment links. See `docs/legal-status.md`.
  Settle-up links (Venmo / Cash App / PayPal deep links, Apple Cash instruction)
  are allowed on **social** stakes only — they open the payer's own app, we
  touch nothing. `SETTLE_UP=0` disables.
- Every reply goes through the outbox (`src/transport/outbox.ts`); never call
  `transport.send` directly from a handler.
- Sendblue: reply to `group_id`, never `from_number`.
- Attachments: download inside the webhook; provider URLs expire in 15 min.
- Money-shaped code (ledger, state machine) is not "done" until its property
  and RPC tests have run and been quoted.

## Stack
Next.js 16 App Router · Supabase (Postgres, Auth, Storage, pg_cron) · LLM
behind `src/model/` (`ModelProvider`): OpenAI (`gpt-5` turns + vision judge,
`gpt-5-mini` classifier) when `OPENAI_API_KEY` is set — Matthew's choice
2026-09-17 — or Claude (`claude-opus-5` / `claude-sonnet-5`) with
`ANTHROPIC_API_KEY`. Linq primary, Sendblue secondary, `TRANSPORT=fake` for tests.

## Commands
`npm test` · `npm run typecheck` · `npm run webhooks:dev` (Linq → localhost, no ngrok)

## Git
Commit after every real unit of work as Matthew Park. One initial push was
authorized on 2026-09-16; further pushes need a go-ahead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
