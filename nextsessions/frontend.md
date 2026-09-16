Continue the textbettingaimessage frontend lane. Read CLAUDE.md and docs/SESSION-frontend.md first.

State: landing (scroll-scrubbed thread), /terms, /privacy, 404, OG image, /app sign-in, dashboard, bet detail all built and verified at 375/768/1440; Lighthouse mobile 100/100/100.

Do, in order:
1. Against a live Supabase project: sign in with a real phone, confirm the OTP arrives from the bot, dashboard lists a real bet, second account cannot see it.
2. /app/bets/[id]: Framer Motion card flip between slip and verdict; Realtime subscription on `bets` so status updates land without refresh.
3. Leaderboard page per chat (`/app/chats/[id]`) using honor + wallet.
4. Landing: replace the drawn video placeholder with a real 7-second clip once one exists; keep LCP < 2.5s.

Keep the betting-slip system; no new fonts; verify both breakpoints and console before committing. Commit as Matthew Park; do not push.
