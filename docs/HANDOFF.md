# HANDOFF — read this first in the next session

Project: **Bookie** — an iMessage bot you add to a friend group chat; text it a bet, everyone 👍 to lock, proof goes in the thread, Claude judges, points settle. Invite-only like Instinct; landing copies folk.com's layout with our own mascot/stickers.

- Folder: `~/Downloads/current-projects/textbettingaimessage` · Repo: `mattypark/textbettingaimessage` (main, pushed once; later commits are local — Matthew pushes)
- Plan of record with all research + citations: `~/.claude/plans/me-and-my-friend-hazy-turtle.md`
- Rules: `CLAUDE.md` (never wire a cash rail; outbox for every send; commit as Matthew Park; don't push)

## What exists (all committed, 260 unit tests + 8 Postgres integration tests green, `next build` green)

| Area | Where | Status |
|---|---|---|
| Transport adapters (Linq primary, Sendblue secondary, fake) | `src/transport/` | done, fixtures from docs (not yet from a live line) |
| Inbound pipeline: verify → claim → media download → identity → **invite gate** → intro/terms → mention gate → handler → outbox | `src/inbound/` | done |
| Points ledger (double-entry, DB-enforced) + cash stub | `src/ledger/`, migration 0002 | done |
| Bet state machine + engine + `!bet`/`!cancel`/`!dispute`/`call` commands | `src/bets/` | done |
| Claude agent (opus-5 tools, sonnet-5 classifier) | `src/agent/` | done, **never run against real Claude yet** |
| Terms gate (👍 intro / "I agree" / web) | `src/onboarding/` | done |
| Cron tick (timeouts, outbox, stuck inbox, judge jobs, waitlist promotion) | `src/jobs/tick.ts`, `/api/cron/tick`, migration 0006 | done |
| Proof: media store, hash/EXIF, video frames (ffmpeg), vision judge, disputes, referee | `src/proof/`, migrations 0007 | done |
| Invite-only: invites (3 uses), waitlist + referral ranks, `code XXXXXXXX` in-thread, `/api/join` | `src/access/`, migration 0009 | done |
| Web: phone OTP via bot line, `/app` dashboard + invite panel, bet detail, media route | `app/app/`, `src/web/`, migration 0008 | done |
| Landing (folk.com layout + motion), `/join` onboarding, terms/privacy/404/OG/sitemap/icon | `app/page.tsx`, `app/(site)/folk/*`, `app/(site)/legal-shell.tsx`, `app/join/` | done, verified 375/768/1440, Lighthouse 100/100/100 |
| `/app` on the folk system: dashboard, bet flip card, leaderboard `/app/chats/[id]`, Realtime hook | `app/app/**`, `src/web/data/`, `src/web/status-theme.ts` | done; only ever run in demo mode |
| `WEB_DEMO=1` seeded mode (8 bets, proofs, verdicts, 5 members) — refuses on Vercel or with Supabase set | `src/web/demo/` | done |
| Launch checklist walk (web) | `docs/LAUNCH-CHECKLIST.md` | 16 done, 2 n/a, spam rate limit + analytics open |
| Docs | `docs/DEPLOY.md`, `docs/SESSION-*.md`, `docs/legal-status.md`, `docs/providers.md`, `nextsessions/*.md` | done |

## What has NOT happened (needs Matthew's hands)

1. **`linq login`** — CLI token expired. Then `npm run dev` + `npm run webhooks:dev` (no ngrok) and do the Stage 0 spike in `docs/providers.md`: add +1 (205) 396-8556 to a real group, send text / 👍 / photo / video, save raw payloads into `tests/fixtures/linq/`. Parser guesses to confirm: `chat.created` participants shape, reaction target ids.
2. **`ANTHROPIC_API_KEY` in `.env.local`** → `npm run agent:smoke "bookie 20 says I make this shot by friday, jake you in?"` and tune `src/agent/prompts/system.ts` + tool descriptions.
3. **Supabase project** → `supabase db push`, Auth phone + Send-SMS hook, `app.tick_url` / `app.cron_secret` settings (all in `docs/DEPLOY.md`). Local stack works on ports 553xx (`supabase start`) but needs Docker — keep Docker off otherwise, it pegs CPU with other projects' stacks.
4. **Seed invite codes**: `insert into invites (code, max_uses) values ('MATT0001', 50);` then share `/join?ref=MATT0001`. Set `INVITE_ONLY=0` locally to bypass the gate.
5. **Vercel deploy** (Matthew deploys; not the "old projects" Vercel account).
6. `/repo-describe-one` on the repo (standing rule after a push) — not run yet.
7. **Real-Supabase pass of `/app`**: sign in with a phone, dashboard shows a real bet, second account can't see it, leaderboard ranks the chat. Then `alter publication supabase_realtime add table bets;` so `LiveStatus` on the bet page fires.
8. Decide: uninstall `gsap`/`lenis`? No — the landing now uses both (`app/(site)/folk/motion.tsx`). Decide on analytics (`@vercel/analytics` = new dep) and a rate limit on `/api/join`.

## Decisions worth not re-litigating

- Real-money stakes held by us are **legally closed** (state "advances or profits" law, Stripe/PayPal/Venmo ban P2P betting by name, money transmission in 49 states, App Store 5.3.4). Path if ever: UX layer on a licensed exchange's B2B API (ProphetX/Novig/Kalshi). `CashLedger` throws until `LEGAL_CLEARANCE=1` + `CASH_PARTNER`.
- Bettors never vote on outcomes — bot judges vs criteria locked at creation; bonded 24h dispute; referee option; challenge token in frame.
- Apple Messages for Business forbids group chats; Linq/Sendblue (Mac-relay) are the only paths. Adapter interface keeps a provider swap to one file.
- npm 10.9.8 breaks on vitest 4 (`edgesOut` null) → `npx -y npm@11 install ...`.

## Commands

`npm test` · `npm run test:integration` (needs local Supabase) · `npm run typecheck` · `npm run build` · `npm run agent:smoke` · `npm run webhooks:dev`

## Suggested next-session prompts

- Backend lane: `nextsessions/backend.md`
- Frontend lane: `nextsessions/frontend.md` (`/app` is on the folk system as of 2026-09-16; what's left is the live run and polish)
