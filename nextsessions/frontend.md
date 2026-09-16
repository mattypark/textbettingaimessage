Continue the textbettingaimessage frontend lane. Read CLAUDE.md and docs/SESSION-frontend.md first.

State (2026-09-16): everything web is on the folk system — landing with folk.com motion, /join, /terms, /privacy, 404, OG, and all of /app (dashboard, bet flip card with Realtime hook, per-chat leaderboard). `WEB_DEMO=1 npm run dev` renders /app with seeded data. Launch checklist walked (docs/LAUNCH-CHECKLIST.md). Lighthouse mobile 100/100/100 on /.

Do, in order:
1. Against a live Supabase project: sign in with a real phone, confirm the OTP arrives from the bot, dashboard lists a real bet, second account cannot see it, /app/chats/[id] ranks the chat. Screenshot 375/768/1440 with real data and fix anything the seed hid.
2. After the backend adds `bets` to the `supabase_realtime` publication: open a bet page, change its row in SQL, confirm the page refreshes and the "live" chip shows.
3. Landing: replace the animated phone thread copy with a real 7-second clip once one exists, or keep the thread; keep LCP < 2.5s on the Vercel URL.
4. Optional cleanup: swap the landing's inline `text-[#1f2a2f]/…` classes for `text-sky-ink/…` tokens (no visual change).
5. Owner decisions to collect: analytics (`@vercel/analytics`, would need a privacy note), whether the hero headline stays white on sky (large text ~2.1–3.3:1, matches folk.com).

No new fonts; verify 375/768/1440 and console before committing. Commit as Matthew Park; do not push.
