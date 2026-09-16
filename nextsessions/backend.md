Continue the textbettingaimessage backend lane. Read CLAUDE.md, docs/SESSION-backend.md, docs/DEPLOY.md, docs/legal-status.md first.

State: stages 1–11 are code-complete with 256 passing unit tests and 8 Postgres integration tests. Nothing has run against the live Linq line yet.

Do, in order:
1. Stage 0 spike (needs Matthew): `linq login`, `npm run dev` + `npm run webhooks:dev`, add +1 (205) 396-8556 to a real 3-person group from a phone, send text / 👍 / photo / 5s video. Save each raw payload (phones redacted) into tests/fixtures/linq/ and fill docs/providers.md.
2. Fix whatever the real payloads disagree with in src/transport/linq/parse.ts (chat.created participants shape is a guess).
3. With ANTHROPIC_API_KEY in .env.local: `npm run agent:smoke "bookie 20 says I make this shot by friday, jake you in?"` and iterate the system prompt / tool descriptions until the card is right on 5 varied phrasings.
4. Record an e2e cassette (FakeModel) for create-and-lock and proof-and-verdict scenarios in tests/e2e.

Never wire a cash rail. Commit as Matthew Park after each real unit; do not push.

Added 2026-09-16 by the frontend lane:
5. `alter publication supabase_realtime add table bets;` — the bet page subscribes to its row (`app/app/bets/[id]/live-status.tsx`) and refreshes on UPDATE; RLS already scopes rows to chat members. Until this runs the hook subscribes and never fires.
6. Optional `chat_leaderboard(p_chat_id uuid)` RPC returning members with honor and available balance; today the web derives net points from settled bets because `ledger_accounts` has no member-readable policy. Swap in `src/web/data/supabase-data.ts` → `leaderboard()`.
7. Rate-limit `POST /api/join` (per IP and per phone) and confirm Supabase Auth OTP throttling; the frontend only has a honeypot.
