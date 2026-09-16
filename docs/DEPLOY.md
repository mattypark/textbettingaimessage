# Deploy runbook

Everything below is one-time setup; the code needs no changes between local and prod.

## 1. Supabase project
1. Create a project. Run the migrations: `supabase link --project-ref <ref>` then `supabase db push`.
2. Storage: migration 0007 creates the private `proofs` bucket.
3. Auth → Providers → Phone: enable. Auth → Hooks → **Send SMS**: HTTPS, URL
   `https://<site>/api/auth/send-sms`, copy the secret into `SUPABASE_AUTH_HOOK_SECRET`.
4. Cron: in the SQL editor
   ```sql
   alter database postgres set app.tick_url = 'https://<site>/api/cron/tick';
   alter database postgres set app.cron_secret = '<CRON_SECRET>';
   ```
   Migration 0006 already scheduled `app_tick()` every minute; it no-ops until these exist.

## 2. Linq
1. `linq login` → `linq doctor` all green. Note the line (`LINQ_FROM_NUMBER`).
2. Production webhook: `linq webhooks create --url https://<site>/api/webhooks/linq?version=2026-02-03 --events message.received,reaction.added,reaction.removed,participant.added,chat.created`; copy the signing secret into `LINQ_WEBHOOK_SECRET`.
3. Local dev instead: `npm run webhooks:dev` (no ngrok).
4. Ask Linq sales in writing whether points-only friendly wagering is acceptable use before launch.

## 3. Vercel
- Env: every key in `.env.example`. `TRANSPORT=linq`, `STAKE_MODE=points`.
- Functions: `/api/cron/tick` and the webhooks set `maxDuration = 60`. Hobby cron is once a day, which is why pg_cron drives the tick.
- The ffmpeg binary (45 MB) is traced into the tick function via `next.config.ts`.

## 4. Smoke checks after deploy
1. `curl -X POST https://<site>/api/cron/tick -H "authorization: Bearer $CRON_SECRET"` → JSON report.
2. Add the line to a 3-person group, text "hey bookie" → intro; 👍 it; `!bet thing ; 5 ; tomorrow`; a friend 👍 → LOCKED.
3. Send a photo → verdict inside a minute (`jobs` table shows the judge job done).
4. Sign in on the web with your phone → code arrives from the bot → dashboard shows the bet.
