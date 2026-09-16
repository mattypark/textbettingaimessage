Continue the textbettingaimessage frontend lane. Read CLAUDE.md and docs/SESSION-frontend.md first.

State: landing is now a folk.com-layout clone (`app/(site)/folk/*`), /join onboarding mirrors folk's signup; earlier betting-slip landing was replaced. /terms, /privacy, 404, OG image, /app sign-in, dashboard (+ invite panel), bet detail all built, /terms, /privacy, 404, OG image, /app sign-in, dashboard, bet detail all built and verified at 375/768/1440; Lighthouse mobile 100/100/100.

Do, in order:
1. Against a live Supabase project: sign in with a real phone, confirm the OTP arrives from the bot, dashboard lists a real bet, second account cannot see it.
2. /app/bets/[id]: Framer Motion card flip between slip and verdict; Realtime subscription on `bets` so status updates land without refresh.
3. Leaderboard page per chat (`/app/chats/[id]`) using honor + wallet.
4. Landing: replace the drawn video placeholder with a real 7-second clip once one exists; keep LCP < 2.5s.

/app still uses the betting-slip tokens; decide with Matthew whether to move it to the folk system (rounded font, sky/mist palette). No new fonts; verify both breakpoints and console before committing. Commit as Matthew Park; do not push.
