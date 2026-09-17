# Backend session — paste this whole file as the first message

Continue the textbettingaimessage backend lane for **Mushy** (renamed from Bookie on 2026-09-17; `BOT_NAMES=mushy`, wake word "hey mushy"). Read `CLAUDE.md`, `docs/HANDOFF.md`, `docs/SESSION-backend.md`, `docs/DEPLOY.md`, `docs/legal-status.md`, `docs/providers.md` first. Do not touch `app/(site)`, `app/app`, `src/web`, `app/globals.css` — the frontend lane finished those; `WEB_DEMO=1 npm run dev` shows them.

## Product truth (do not drift)

- Mushy is a bot **line** that gets added to an existing iMessage **group chat**. No per-person number, no member cap, no "create a chat with the bot" flow. A DM to the line also works (gate reason `dm`) but the product is the group.
- Wake word: someone says **"hey mushy"** (any casing, `@mushy` too). The gate then keeps listening for **2 minutes** after Mushy's last message (`ATTENTION_WINDOW_MS`, `src/inbound/mention-gate.ts`); follow-ups go through the sonnet classifier so unrelated chatter stays silent. Replies to / reactions on Mushy's messages, `!commands`, and proof attachments from someone who owes proof always get through. This is the Instinct model.
- Points only. Never wire a cash rail. Every reply goes through the outbox.

## What Matthew has already set up / will set up before you run (ask him to confirm each)

1. `linq login` → `linq doctor` green. Line: +1 (205) 396-8556 (`LINQ_FROM_NUMBER`).
2. `ANTHROPIC_API_KEY` in `.env.local` (never read that file; ask him whether it is there).
3. Supabase project created, `supabase link` + `supabase db push` done, Auth phone enabled, Send-SMS hook pointed at `/api/auth/send-sms`, `app.tick_url` / `app.cron_secret` set (`docs/DEPLOY.md` §1). `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
4. One invite seeded: `insert into invites (code, max_uses) values ('MATT0001', 50);` (or `INVITE_ONLY=0` locally).
5. A real 3-person iMessage group on his phone he is willing to add the line to.

## Do, in order (each has a done-check; stop and report if one fails)

1. **Stage 0 spike.** `npm run dev` + `npm run webhooks:dev`. Matthew adds the line to the group and sends: "hey mushy", a 👍 on the reply, a photo, a 5-second video. Save each raw payload (phones redacted) into `tests/fixtures/linq/`, fill `docs/providers.md`. Confirm `chat.created` participants shape and reaction target ids in `src/transport/linq/parse.ts`. Done: replayed fixtures parse; "hey mushy" gets one reply **in the group**, not a DM.
2. **Attention window live.** After Mushy replies, a plain follow-up ("ok 20 pts by friday") with no name must reach the classifier and get acted on; an unrelated message two minutes later must be ignored (`inbox` row status `ignored`, reason `silent`). Tune `ATTENTION_WINDOW_MS` only with evidence from the group.
3. **Agent smoke.** `npm run agent:smoke "mushy 20 says I make this shot by friday, jake you in?"` and four more phrasings; tune `src/agent/prompts/system.ts` and tool descriptions until the card is right on all five. Two phones lock a bet via 👍.
4. **Proof → verdict.** Photo in the group → verdict inside 60 s (`jobs` table shows the judge job done). Then a 5 s video.
5. **Realtime + web live pass.** Run `alter publication supabase_realtime add table bets;`. Matthew signs in on `/app` with his phone (OTP arrives from the line), sees the bet, second phone cannot see it, bet page refreshes by itself when the row changes, `/app/chats/[id]` ranks the chat.
6. **Spam.** Rate-limit `POST /api/join` (per IP and per phone, e.g. 5/hour) and confirm Supabase OTP throttling. Frontend only has a honeypot.
7. **Optional RPC** `chat_leaderboard(p_chat_id uuid)` returning members with honor and available balance, then swap it into `src/web/data/supabase-data.ts` → `leaderboard()`.
8. Record an e2e cassette (FakeModel) for create-and-lock and proof-and-verdict in `tests/e2e`. Update `README.md` stage table and `docs/HANDOFF.md`.

Commit as Matthew Park after each real unit; do not push. Quote failing output verbatim; never say tests pass without running them.
