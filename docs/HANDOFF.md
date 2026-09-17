# HANDOFF — read this first in the next session

Project: **Mushy** (renamed from Bookie 2026-09-17; `BOT_NAMES=mushy`, wake word "hey mushy") — an iMessage bot you add to a friend group chat; text it a bet, everyone 👍 to lock, proof goes in the thread, Claude judges, points settle. Invite-only like Instinct; landing copies folk.com's layout with our own mascot/stickers.

- Folder: `~/Downloads/current-projects/textbettingaimessage` · Repo: `mattypark/textbettingaimessage` (main, pushed once; later commits are local — Matthew pushes)
- Plan of record with all research + citations: `~/.claude/plans/me-and-my-friend-hazy-turtle.md`
- Rules: `CLAUDE.md` (never wire a cash rail; outbox for every send; commit as Matthew Park; don't push)

## What exists (all committed, 260 unit tests + 8 Postgres integration tests green, `next build` green)

| Area | Where | Status |
|---|---|---|
| Transport adapters (Linq primary, Sendblue secondary, fake) | `src/transport/` | done, fixtures from docs (not yet from a live line) |
| Inbound pipeline: verify → claim → media download → identity → **invite gate** → intro/terms → mention gate (name, reply, reaction, command, proof, **2-minute attention window after the bot speaks → classifier**) → handler → outbox | `src/inbound/` | done |
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
| Docs | `docs/DEPLOY.md`, `docs/SESSION-*.md`, `docs/legal-status.md`, `docs/providers.md`, `docs/SETUP-LIVE.md`, `nextsessions/*.md` | done |
| Spam guards: `/api/join` 5/h per IP + phone, bot turns per sender (30/h) + per chat (120/h), one nudge then silence | `src/access/rate-limit.ts`, migration 0010, `src/inbound/pipeline.ts` `turnLimit` | done (unit-tested; RPC test needs a DB) |
| `chat_leaderboard(p_chat_id)` RPC, wired into `SupabaseWebData.leaderboard()` (adds `available`) | migration 0011, `src/web/queries.ts` | done (integration test signs in as member + outsider) |
| E2E cassettes: create-and-lock, proof-and-verdict, on a FakeModel/FakeJudge harness | `tests/e2e/` | done, 6 scenarios green |
| Settle-up + holder-funded stakes: `!pay` handles, Venmo/Cash App/PayPal links, "$20 each, sam holds it" → pay-the-holder request after LOCKED, `paid`/`got it` (tools + `!paid`/`!got`), holder pays winner after SETTLED. **Frontend:** `bet.state.funding` is new (`Funding` in `src/bets/types.ts`); the flip card could show paid/holder state | `src/settle/`, migration 0012 | done, 8 scenarios green |
| Zero-token path: templates (bare wake, help, thanks), plain-English twins of !commands (leaderboard, balance, invite), the scripted bet builder ("hey mushy" → what's the bet → how much → by when → card, `bet_drafts` migration 0014), `MODEL_MODE=off` never calls a model, `JUDGE_MODE=confirm` (default) makes the opponent call the result with `call #id yes/no` instead of the vision judge | `src/agent/templates.ts`, `src/bets/draft-flow.ts`, `src/proof/intake.ts` | done, e2e green |
| Tap-to-pay + sign sheets: `/pay/<bet>` (Apple-style sheet: amount, who→who, Open Venmo/Cash App/PayPal, "I sent it") and `/sign/<chat>` (name + number + typed signature over the full terms + privacy, `signatures` table 0016), each with an OG card image; Linq `link` parts render them as rich cards once `NEXT_PUBLIC_SITE_URL` is public. Custom terms + privacy text lives in `src/onboarding/legal.ts` and feeds /terms, /privacy and the sign sheet. Linq also supports `imessage_app` card parts (GamePigeon-style) but they need a real Messages extension bundle id — a native app, phase 2 | `app/pay`, `app/sign`, `src/settle/pay-page.ts`, `src/onboarding/sign.ts` | done, tests green; cards only show once deployed |
| Local run tooling: `npm run tick:dev` (pg_cron stand-in), `npm run linq:capture` (redacted Stage-0 fixtures + tee) | `scripts/tick-loop.ts`, `scripts/linq-capture.ts` | done |

## Live status (2026-09-17 afternoon)

- **Stage 0 passed.** Linq free-tier *shared* line +1 (205) 396-8556 sits in a real 3-person group; "hey mushy" → inbox row → outbox → reply in the group. Shared line routes only numbers registered with `linq contacts add`. `linq doctor`'s "Session expired" is cosmetic.
- OpenAI gpt-5 smoke: 5 phrasings → card + one casual line. Reasoning tokens need an 8000-token floor (`src/model/openai.ts`); `MODEL_DEBUG=1` prints tool calls.
- Cloud Supabase: migrations 0001–0013 applied; integration tests 11/11; `/api/join` 429 live.
- Still needs the phone: 👍 lock, attention window, photo/video verdict. Still needs a deploy: `/app` phone OTP (Send SMS hook needs a public URL).
- Model credits are Matthew's; do not loop `agent:smoke` — cassette tests are free.

## Deploy is now the blocker

Every link the bot sends (sign sheet, pay sheet, terms) points at `NEXT_PUBLIC_SITE_URL`, which is `http://localhost:3000` until the app is deployed. Deploy to Vercel (Matthew's own account), set `NEXT_PUBLIC_SITE_URL=https://<app>.vercel.app` in Vercel env and in `.env.local`, redeploy; a custom domain can come later and only changes that one value.

## What has NOT happened (needs Matthew's hands)

As of 2026-09-17 midday none of the prerequisites exist on this Mac (no `.env.local`, `linq` session expired, Supabase not linked). Exact steps: `docs/SETUP-LIVE.md`. Supabase = cloud project (decided 2026-09-17; Docker stays off). After `supabase db push`, migrations 0010 + 0011 must go up too.

1. **`linq login`** — CLI token expired. Then `npm run dev` + `npm run webhooks:dev` (no ngrok) and do the Stage 0 spike in `docs/providers.md`: add +1 (205) 396-8556 to a real group, send text / 👍 / photo / video, save raw payloads into `tests/fixtures/linq/`. Parser guesses to confirm: `chat.created` participants shape, reaction target ids.
2. **`ANTHROPIC_API_KEY` in `.env.local`** → `npm run agent:smoke "mushy 20 says I make this shot by friday, jake you in?"` and tune `src/agent/prompts/system.ts` + tool descriptions.
3. **Supabase project** → `supabase db push`, Auth phone + Send-SMS hook, `app.tick_url` / `app.cron_secret` settings (all in `docs/DEPLOY.md`). Local stack works on ports 553xx (`supabase start`) but needs Docker — keep Docker off otherwise, it pegs CPU with other projects' stacks.
4. **Seed invite codes**: `insert into invites (code, max_uses) values ('MATT0001', 50);` then share `/join?ref=MATT0001`. Set `INVITE_ONLY=0` locally to bypass the gate.
5. **Vercel deploy** (Matthew deploys; not the "old projects" Vercel account).
6. `/repo-describe-one` on the repo (standing rule after a push) — not run yet.
7. **Real-Supabase pass of `/app`**: sign in with a phone, dashboard shows a real bet, second account can't see it, leaderboard ranks the chat. Then `alter publication supabase_realtime add table bets;` so `LiveStatus` on the bet page fires.
8. Decide: uninstall `gsap`/`lenis`? No — the landing now uses both (`app/(site)/folk/motion.tsx`). Decide on analytics (`@vercel/analytics` = new dep). `/api/join` rate limit is done.
9. Scope reminder (Matthew, 2026-09-17): iMessage bot + website only, no native app. Apple Wallet / Apple Cash money-in was asked for and declined — no API exists and cash custody is closed (`docs/legal-status.md`); reopening needs an explicit override plus a licensed partner.

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
