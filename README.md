# textbettingaimessage

A bot you add to your friend group chat on iMessage. Text it a bet
("$20 says I make this half-court shot by Friday"), everyone taps 👍 to lock
it, the loser sends proof in the thread, the bot judges and settles.

v1 stakes are **points and social forfeits** (loser buys dinner). Real money
is legally closed for an unlicensed operator today — the ledger is pluggable
and the path is documented in `docs/legal-status.md`.

## Run it locally

```bash
cp .env.example .env.local        # fill in Linq + Supabase + Anthropic keys
npm install
npm run dev                       # http://localhost:3000
npm run webhooks:dev              # streams Linq webhooks to /api/webhooks/linq
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
- `app/app/` + `src/web/` — phone-OTP web app
- `supabase/migrations/` — schema; money invariants live in Postgres
- `tests/fixtures/{linq,sendblue}/` — captured webhook payloads
