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

Check: `linq doctor` — every row green **except** "Session expired", which is
a dashboard-session check and does not affect the API or `webhooks listen`.

**Shared line (Free tier).** +1 (205) 396-8556 is a shared line: only numbers
you register are routed to you. Add yourself and both friends:

```bash
linq contacts add +1XXXXXXXXXX
linq contacts list
```

Whether a shared line can sit in a group chat is the Stage 0 question. If
messages from the group never arrive, `linq upgrade` buys a dedicated line.

## 2. Supabase — cloud project (no Docker)

1. Create a project at supabase.com (any region near Houston; free tier is fine).
2. Link and push the schema:
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push          # migrations 0001–0012 (0010 rate limits, 0011 leaderboard RPC, 0012 pay handles)
   ```
3. Dashboard → **Auth → Providers → Phone** — **skip for now.** The bot
   (Stages 0–3) never uses Supabase phone auth; only `/app` web sign-in does
   (Stage 4). The dashboard refuses to save Phone without Twilio fields, and
   we do not use Twilio: our Send SMS hook (step 4) delivers the code from
   the bot line. When Stage 4 comes: pick Twilio, fill placeholder values
   (Account SID `AC` + 32 hex, any 32-char token, Message Service SID `MG`
   + 32 hex), save, then enable the hook — the hook replaces provider
   sending. If Supabase rejects placeholders, a free Twilio trial account
   satisfies the form and still never sends (the hook does). Cancel today.
4. Dashboard → **Auth → Hooks → Send SMS** (Stage 4 only): type HTTPS, URL
   `https://<public-site>/api/auth/send-sms`. Must be public, so web OTP
   works once deployed (Vercel preview is enough). Copy the secret into
   `SUPABASE_AUTH_HOOK_SECRET`.
5. Dashboard → **Auth → Rate Limits**: note the SMS values (default 30/hour,
   one OTP per phone per 60 s). Read only — Claude records them in the launch checklist.
6. Dashboard → **Project Settings → API**: copy into `.env.local`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
7. Cron settings are for production only (`docs/DEPLOY.md` §1). Locally the
   tick runs from `npm run tick:dev`, nothing to set.

Check: `supabase migration list` shows 0001–0009 applied remotely.

## 3. The model — OpenAI (your call)

1. platform.openai.com → API keys → create one. Add a few dollars of credit
   (Billing). A ChatGPT Plus subscription does not include API access.
2. `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5            # agent turns + vision judge (default)
   OPENAI_MODEL_SMALL=gpt-5-mini # follow-up classifier (default)
   ```
   Leave `ANTHROPIC_API_KEY` empty. If both are set, OpenAI wins unless
   `MODEL_PROVIDER=anthropic`.
3. Without any key the bot still runs its deterministic paths: intro,
   `!bet … ; 20 ; friday`, 👍 lock, `!cancel`, `!pay`, `!balance`. The key
   unlocks plain-English bets ("hey mushy 20 says…"), the follow-up
   classifier and proof verdicts.

Check: `npm run agent:smoke "mushy 20 says I make this shot by friday, jake you in?"`
prints `--- model: openai ---` and a card.

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

One per terminal tab, typed exactly (zsh treats a trailing `#` as an argument, not a comment):

```bash
npm run dev
```
```bash
npm run webhooks:dev
```
```bash
npm run tick:dev
```

`npm run dev` is the bot: Linq posts every iMessage to `/api/webhooks/linq`
inside it. `tick:dev` prints "fetch failed" until `dev` is up.
