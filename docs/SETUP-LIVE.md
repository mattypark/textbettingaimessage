# Live setup — what Matthew does before the first real run

Everything the backend lane cannot do for you: logins, keys, the Supabase
project, the invite seed, the group. Do these in order; each ends with a
check you can say out loud ("linq doctor green", "db push done"). Claude
never opens `.env.local` — it will ask you to confirm each key by name.

## 1. Linq (the iMessage line)

```bash
linq login            # opens the browser; the CLI token had expired
linq doctor           # every row must be green
linq tokens           # copy the API key
```

- `.env.local`: `LINQ_API_KEY=<from linq tokens>`, `LINQ_FROM_NUMBER=+12053968556`.
- `LINQ_WEBHOOK_SECRET`: shown when you run `npm run webhooks:dev` (the dev
  listener prints its signing secret). Paste it, restart `npm run dev`.

Check: `linq doctor` all green.

## 2. Supabase — cloud project (no Docker)

1. Create a project at supabase.com (any region near Houston; free tier is fine).
2. Link and push the schema:
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push          # migrations 0001–0009 now; 0010–0011 land later in this session
   ```
3. Dashboard → **Auth → Providers → Phone**: enable.
4. Dashboard → **Auth → Hooks → Send SMS**: type HTTPS, URL
   `https://<public-site>/api/auth/send-sms`. This must be a public URL, so
   web OTP only works once the app is deployed (Vercel preview is enough).
   For the local run today, skip it — the bot side does not need it.
   When you do set it, copy the secret into `SUPABASE_AUTH_HOOK_SECRET`.
5. Dashboard → **Auth → Rate Limits**: note the SMS values (default 30/hour,
   one OTP per phone per 60 s). Read only — Claude records them in the launch checklist.
6. Dashboard → **Project Settings → API**: copy into `.env.local`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Cron settings are for production only (`docs/DEPLOY.md` §1). Locally the
   tick runs from `npm run tick:dev`, nothing to set.

Check: `supabase migration list` shows 0001–0009 applied remotely.

## 3. Claude

- `.env.local`: `ANTHROPIC_API_KEY=<console.anthropic.com key>`.

Check: `npm run agent:smoke "mushy 20 says I make this shot by friday, jake you in?"` prints a card.

## 4. `.env.local`

```bash
cp .env.example .env.local
```

Fill the keys above, then set:

```
TRANSPORT=linq
STAKE_MODE=points
INVITE_ONLY=0          # first live run only; flip to 1 after the invite is seeded
CRON_SECRET=<any long random string>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 5. Invite seed (needed once `INVITE_ONLY=1`)

Dashboard → SQL editor:

```sql
insert into invites (code, max_uses) values ('MATT0001', 50);
```

Share `http://localhost:3000/join?ref=MATT0001` (or the deployed URL) with the two friends.

## 6. The group

A real iMessage group on your phone with two friends who are okay being
test subjects. You will add **+1 (205) 396-8556** to it during Stage 0 and
send, in order: "hey mushy", a 👍 on the reply, a photo, a 5-second video.

## 7. Say "go"

Tell Claude which of 1–6 are done. Then the panes are:

```bash
npm run dev               # app on :3000
npm run webhooks:dev      # Linq → localhost, no ngrok
npm run tick:dev          # every 15 s: outbox, judge jobs, timeouts
npm run linq:capture      # Stage 0 only: saves redacted payloads to tests/fixtures/linq/
```
