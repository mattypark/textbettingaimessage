# textbettingaimessage

A bot you add to your friend group chat on iMessage. Text it a bet
("$20 says I make this half-court shot by Friday"), everyone taps 👍 to lock
it, the loser sends proof in the thread, the bot judges and settles.

v1 stakes are **points and social forfeits** (loser buys dinner). Real money
is legally closed for an unlicensed operator today — the ledger is pluggable
and the path is documented in `docs/legal-status.md`.

## Stages — status for the next session

Mirror of the task panel (2026-09-16). "code-complete" = built + unit-tested, never run against the live Linq line / real Claude / a Supabase project. Do them **in order**; each has a done-check.

| # | Stage | Status | What's left / done-check |
|---|---|---|---|
| 0 | Provider spike — add bot to an existing group (Linq, then Sendblue) | **open** | `linq login` → `npm run dev` + `npm run webhooks:dev` → from a phone add +1 (205) 396-8556 to a 3-person group → text, 👍, photo, 5s video → save raw payloads (phones redacted) into `tests/fixtures/linq/` → fill `docs/providers.md` |
| 1 | Scaffold + transport adapters + live round-trip | **in progress** | code done; "hey mushy" in a real group must get a reply in the group (not a DM); replayed webhook → one reply |
| 2 | Double-entry points ledger + CashLedger stub | done | property tests + Postgres RPC tests pass |
| 3 | Bet state machine + engine (no LLM) | **in progress** | code done; live check: two phones lock a bet via 👍 with `!bet thing ; 20 ; friday` |
| 4 | Claude agent layer + mention gate | **in progress** | code done; needs `ANTHROPIC_API_KEY` in `.env.local` → `npm run agent:smoke "mushy 20 says I make this shot by friday, jake you in?"` → tune `src/agent/prompts/system.ts` on 5 phrasings |
| 5 | Onboarding + terms in iMessage and web | done | intro once per chat; 👍/"I agree" gates stakes |
| 6 | Timeouts + pg_cron tick + outbox drain | done | needs `app.tick_url`/`app.cron_secret` set in prod (docs/DEPLOY.md) |
| 7 | Proof intake + photo judging (Claude vision) | done | live check pending: photo in group → verdict < 60s |
| 8 | Disputes (bonded) + honor score | done | `!dispute #id reason`, referee `call #id yes|no` |
| 9 | Video proof via ffmpeg keyframes | done | confirm the 45 MB ffmpeg binary deploys on Vercel |
| 10 | Web app — phone OTP, bets, wallet, RLS | done | live check pending: real phone sign-in, second account can't see your bet |
| 11 | First landing (betting-slip) | retired | betting-slip tokens removed 2026-09-16; everything is on the folk system |
| 12 | Hardening, docs, launch checklist | **in progress** | docs done; 20-item checklist walked on the web surfaces (`docs/LAUNCH-CHECKLIST.md`: 16 done, 2 n/a, spam rate-limit + analytics open); left: load test 50 webhooks/min, week-long soak with a real group, `/repo-describe-one` |
| 13 | Invite-only — referral links, waitlist, bot gate | done | seed a code: `insert into invites (code, max_uses) values ('MATT0001', 50);` |
| 14 | folk.com-style landing + `/join` onboarding | done | verified 375/768/1440; folk.com motion added (pop-in, scroll reveals, Lenis, hide-on-scroll nav, live phone thread) |
| 15 | Web: `/app` on the folk system, `WEB_DEMO=1`, flip card + Realtime hook, leaderboard | done (frontend) | `WEB_DEMO=1 npm run dev` renders every `/app` screen with seeded data; live checks pending: real phone sign-in, `alter publication supabase_realtime add table bets;` so the bet page refreshes itself |

Start here next session: `docs/HANDOFF.md` → this table → `nextsessions/backend.md` or `nextsessions/frontend.md`.

## Run it locally

```bash
cp .env.example .env.local        # fill in Linq + Supabase + Anthropic keys
npm install
npm run dev                       # http://localhost:3000
npm run webhooks:dev              # streams Linq webhooks to /api/webhooks/linq
WEB_DEMO=1 npm run dev            # /app with seeded data, no Supabase needed (dev only, off on Vercel)
```

`linq login` first if the CLI token has expired (`linq doctor` tells you).

## Test

```bash
npm test                          # unit + transport fixtures + e2e replay
npm run typecheck
```

## Deploy

See `docs/DEPLOY.md` (Supabase, Linq webhook, Vercel, pg_cron settings).

## Layout

- `src/transport/` — provider adapters (Linq, Sendblue, fake) behind one `MessageTransport`
- `src/inbound/` — webhook pipeline: verify → claim → normalize → identity → gate → handler → outbox
- `src/bets/` — pure state machine, engine with idempotent effects, commands, disputes
- `src/ledger/` — double-entry points ledger (Postgres-enforced invariants), cash stub
- `src/agent/` — Claude tools, turn runner, classifier, routing
- `src/proof/` — media store, hashing/EXIF, video frames, vision judge, job runner
- `src/jobs/tick.ts` — the once-a-minute sweep (timeouts, outbox, stuck inbox, judge jobs)
- `app/app/` — phone-OTP web app: dashboard, bet flip card, per-chat leaderboard (`_ui/` primitives)
- `src/web/` — `data/` (one `webData()` entry: Supabase or demo adapter), `demo/` (flag + seed), `status-theme.ts`, `leaderboard.ts`
- `app/(site)/folk/` — the design system: mascot, stickers, nav, phone, motion (Reveal, LandingMotion)
- `supabase/migrations/` — schema; money invariants live in Postgres
- `tests/fixtures/{linq,sendblue}/` — captured webhook payloads
