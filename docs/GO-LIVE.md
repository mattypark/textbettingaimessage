# Go live — the last mile

The app is deployed. Everything below is one-time, in this order. Each step
says how you know it worked.

## 1. Vercel environment variables

Project → Settings → Environment Variables, **Production and Preview**.
After any change: Deployments → the top one → ⋯ → **Redeploy** (env changes
do not apply to an existing build).

| Key | Value | Why |
|---|---|---|
| `TRANSPORT` | `linq` | **Currently wrong.** Anything else makes `/api/webhooks/linq` answer 503 and the bot never hears the group. |
| `LINQ_API_KEY` | your Linq token | sending |
| `LINQ_FROM_NUMBER` | `+12053968556` | the line |
| `LINQ_WEBHOOK_SECRET` | from step 2 | **Required in production.** Without it every incoming webhook is rejected. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | database |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | server-side writes |
| `CRON_SECRET` | any long random string | Vercel Cron sends it back as a bearer; the tick refuses without it |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain-or-vercel-url>` | every link the bot sends. Leave blank and it uses the Vercel URL automatically |
| `NEXT_PUBLIC_BOT_NUMBER` | `+12053968556` | the landing page CTA |
| `MODEL_MODE` | `off` | zero AI usage: templates + scripted builder only. `assist` (default) also parses one-liners |
| `JUDGE_MODE` | `confirm` | the other side calls the result. `vision` uses the model to judge photos |
| `INVITE_ONLY` | `1` | one activated member opens a whole chat |
| `STAKE_MODE` | `points` | never change |
| `SETTLE_UP` | `1` | pay links after a money bet |
| `OPENAI_API_KEY` | your key | only used when `MODEL_MODE=assist` or `JUDGE_MODE=vision` |

Optional, later: `LINQ_IMESSAGE_APP_BUNDLE_ID=com.mushy.app.MushyMessages`
once the Messages extension ships — it turns the sign and pay links into
GamePigeon-style cards.

Check: `curl -s -o /dev/null -w '%{http_code}' -X POST https://<site>/api/webhooks/linq`
returns **401** (signature missing), not 503 (transport off).

## 2. Point Linq at production

```bash
linq webhooks create \
  --url 'https://<site>/api/webhooks/linq?version=2026-02-03' \
  --events message.received,reaction.added,reaction.removed,participant.added,chat.created
```

It prints a signing secret **once** — paste it into `LINQ_WEBHOOK_SECRET` on
Vercel, then redeploy. Delete the stale ones: `linq webhooks list`, then
`linq webhooks delete <id>` for anything that is not the new production URL.

Stop `npm run dev`, `npm run webhooks:dev` and `npm run tick:dev` locally —
production now owns the line, and two listeners on one line double every reply.

Check: `linq webhooks list` shows exactly one active webhook, your site.

## 3. The tick

`vercel.json` runs `/api/cron/tick` every minute, so nothing to do in
Supabase. (The pg_cron path in `docs/DEPLOY.md` §1 is the alternative if you
ever leave Vercel.)

Check: Vercel → your project → Cron Jobs shows the job, and after a minute
Logs shows `GET /api/cron/tick 200`.

## 4. Who can text it

The free Linq tier is a **shared** line: it only routes numbers you register.

```bash
linq contacts add +1XXXXXXXXXX     # each friend, once
linq contacts list
```

`linq upgrade` buys a dedicated line that hears anyone — needed before real
users, not before this test.

## 5. Web sign-in (optional, only for /app)

Supabase → Auth → Providers → Phone: on. Auth → Hooks → Send SMS: HTTPS,
`https://<site>/api/auth/send-sms`; paste the hook secret into
`SUPABASE_AUTH_HOOK_SECRET` on Vercel. The bot itself does not need this.

## 6. The script, in the group

Say these in order. Nothing here spends a model token when `MODEL_MODE=off`.

| # | You send | Expect |
|---|---|---|
| 1 | `hey mushy` | intro + contact card + the sign card. Tap **Add** on the contact, tap the sign card |
| 2 | (on the sheet) name, number, read both, sign | chat says `✍️ <name> signed (1/2)` |
| 3 | friend does the same | `✍️ … signed (2/2) — everyone's in, run it` |
| 4 | `hey mushy` | `what's the bet` |
| 5 | `i make this half court shot` | `how much?` |
| 6 | `20` | `by when?` |
| 7 | `friday` | 🎯 the bet card |
| 8 | friend taps 👍 on the card | `🔒 LOCKED` |
| 9 | send a photo in the thread | `📸 proof's in — <friend> you're calling it` |
| 10 | friend: `call #xxxxxx yes` | `⚖️ VERDICT`, then `💸 SETTLED` a day later |
| 11 | `mushy leaderboard` | the standings |
| 12 | `mushy invite` | your personal invite link |

Real money instead of points: at step 5 say `$20 each i beat dillon 1v1`, and
at step 6 name who holds it (`sam holds it`). After LOCKED everyone gets a
tap-to-pay card; `paid` and `got it` track the pot; after the verdict the
holder gets one link to pay the winner. Mushy never touches the money.

## 7. Domain

Buy it, add it in Vercel → Domains, then set `NEXT_PUBLIC_SITE_URL` to
`https://<domain>` and redeploy. That single variable is every link the bot
sends; nothing else changes.
