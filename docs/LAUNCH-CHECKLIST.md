# Launch checklist — web surfaces (walked 2026-09-16)

Twenty items, each marked **done**, **n/a** (with the reason), or **backend/deploy** (not reachable from the frontend lane). Re-walk after the real-Supabase run and before the first public invite.

| # | Item | Status | Evidence / where |
|---|---|---|---|
| 1 | Privacy policy page | **done** | `/privacy` on the folk system (`app/(site)/privacy/page.tsx`), linked from nav, footer, `/app` header |
| 2 | Terms & conditions page | **done** | `/terms` reads `TERMS_SUMMARY` from `src/onboarding/terms.ts` (same text the bot sends) |
| 3 | Secrets off the frontend | **done** | Only `NEXT_PUBLIC_*` reaches client code (`grep -rn process.env app src/web src/db/browser.ts`); service-role, Anthropic, Linq keys are server-only; `WEB_DEMO` cannot enable on Vercel |
| 4 | Force HTTPS | **deploy** | Vercel serves HTTPS and redirects HTTP by default; nothing to do in code |
| 5 | Cookie consent banner | **n/a** | Only strictly-necessary Supabase auth cookies on `/app`; no analytics or ad cookies. Disclosed under "cookies" on `/privacy`. Revisit if #19 adds a tracker |
| 6 | Meta titles + descriptions | **done** | Root template `%s · Mushy`; per-route titles on `/join`, `/terms`, `/privacy`, `/app`, `/app/bets/[id]`, `/app/chats/[id]`, `/app/sign-in`; `/app/*` are `noindex` |
| 7 | Social preview image | **done** | `app/opengraph-image.tsx` (sky hero, 1200×630); dangling `/og.png` reference removed |
| 8 | Favicon | **done** | `app/favicon.ico` + new `app/icon.svg` (mascot) |
| 9 | Sitemap + robots.txt | **done** | `app/sitemap.ts` (`/`, `/join`, `/terms`, `/privacy`), `app/robots.ts` disallows `/app`, `/api` |
| 10 | Alt text on images | **done** | Every decorative SVG is `aria-hidden`; proof `<img>` carry `alt="proof from <name>"`; verdict word and confidence ring are `role="img"` with labels |
| 11 | Compress images | **n/a** | No raster assets shipped; mascots/stickers are inline SVG, proofs are user media served via `/api/media` |
| 12 | Page load speed | **done** | Landing, mobile, local dev: LCP 233 ms, CLS 0.01 (chrome-devtools trace); two Google fonts dropped. Re-measure on the Vercel URL |
| 13 | Colour contrast | **done** | Body text on mist lifted to ink/70 (5.2:1); large headings ≥ /55; status chips use darkened tones (≥ 4.5:1 on their tints); phone chrome greys darkened. Lighthouse a11y 100 on `/` and `/app`. Accepted deviation: white hero headline on the sky gradient is ~2.1–3.3:1 (large, text-shadowed, matches folk.com) |
| 14 | Mobile friendly | **done** | Every route screenshot at 375 / 768 / 1440 in demo mode; `scrollWidth === innerWidth` at 375 |
| 15 | Custom 404 | **done** | `app/not-found.tsx` (mascot asleep, back-to-start) |
| 16 | Broken links | **done** | Crawler over all internal hrefs: 22 URLs, 0 non-2xx; nav anchors now `/#bets`, `/#more` so they work off the landing |
| 17 | Form validation | **done** | Sign-in: E.164 + 6 digits; join: E.164 + code; errors `role="alert"` and wired with `aria-describedby` / `aria-invalid` |
| 18 | Spam protection on forms | done | Honeypot on `/join` (frontend). `/api/join` rate-limited 5/hour per address and per phone (`src/access/rate-limit.ts`, migration 0010, 429 + Retry-After). OTP: local `max_frequency = 60s`; cloud values (30 SMS/hour, 60 s per phone) to be read off Auth → Rate Limits during the live pass |
| 19 | Analytics | **open (owner call)** | Nothing wired. `@vercel/analytics` is a new dependency; adding it flips #5 to "disclose in privacy" |
| 20 | One clear call to action | **done** | Landing: "text mushy" / "Start now" → `/join`; `/join` one button per step; `/app` empty state → text the bot |

## Lighthouse (mobile, dev server, 2026-09-16)

| Route | Accessibility | Best practices | SEO |
|---|---|---|---|
| `/` | 100 | 100 | 100 |
| `/app` (demo) | 100 | 100 | 63 — intentional `noindex` |

## How this was verified

`WEB_DEMO=1 npm run dev`, then chrome-devtools MCP: viewport emulation at 375×812 (mobile), 768×1024, 1440×900; `lighthouse_audit` mobile; `performance_start_trace`; a Node crawler over every internal `href`. Screenshots live in the session job folder, not the repo.
