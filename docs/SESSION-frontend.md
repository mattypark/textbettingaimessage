# Frontend session — rules of the lane

Owns: `app/(site)/**`, `app/app/**`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `app/opengraph-image.tsx`, `app/icon.svg`, `app/sitemap.ts`, `src/web/**`, `public/**`, `tests/unit/web-*.test.ts`.
Does not touch: `src/bets`, `src/ledger`, `src/agent`, `src/proof`, `src/inbound`, `src/access`, `src/db`, `src/auth`, `src/config`, `proxy.ts`, `supabase/**`, `app/api/**` — backend lane.

## Design system (one look everywhere, folk.com-derived)

Tokens in `app/globals.css` under "folk-style system", registered in `@theme inline`:
`sky-ink #1f2a2f` (text), `sky-mist #eef1f5` (page), `sky-blue #1a8cff` (iMessage), stickers `sticker-blue/green/yellow/red/orange`, `font-round` (ui-rounded → SF Pro Rounded → system → Inter). Write `text-sky-ink/70`, `bg-sticker-yellow/35`, never new hexes.

- Body text on mist is `sky-ink/70` or darker (5.2:1). Large headings (≥ 24px) may go to `/55`. Placeholders `/55`.
- Classes: `.card-soft` (translucent card, lifts on hover when it is a link or has `.card-lift`), `.pill-3d`, `.pill-blue`, `.btn-dark`, `.nav-pill`, `.tab-pill`, `.chip`, `.sky-hero`, `.sky-band` (compact header for /app and legal pages), `.tnum` (tabular numerals), `.glass` via `GlassBall`.
- Brand mark = the black speech-bubble blob in `public/brand/` (`mushy-mark*.png`, black/white/flat + 512px cuts; also `app/icon.png`, `app/apple-icon.png`). `Mascot mood=` wave | zen | cheer | sleep | money | ref only tilts it and adds a small badge; `tone="white"` for dark/sky. `Avatar` = black circle + white mark. Never redraw the mascot in SVG. Status → accent/glyph/mood lives in `src/web/status-theme.ts` (tested). Never pick a colour for a status by hand.
- Stickers (`app/(site)/folk/stickers.tsx`) are inline SVG, `aria-hidden`, forward SVG props.
- `/app` pages are thin server components that call `webData()` (`src/web/data`) and render `app/app/_ui/*` primitives. Never import `supabaseServer` or `src/web/queries` from a page.

## Motion

- Landing: `LandingMotion` (Lenis smooth wheel scroll + GSAP ScrollTrigger parallax tweening `--py` on `[data-parallax]` inside `[data-hero]`), `.pop` (staggered spring pop-in via `--delay`), `Reveal` (Framer whileInView once), `FolkNav` hides on scroll-down, `Phone` plays its thread on view.
- `/app`: Framer Motion only for the bet flip card. Realtime via `LiveStatus` (no-op without Supabase).
- Only `transform` and `opacity` animate. Every animation switches off under `prefers-reduced-motion` (global rule + component checks). Lenis and GSAP are landing-only.

## Demo mode

`WEB_DEMO=1 npm run dev` renders every `/app` screen from `src/web/demo/seed.ts`. The flag is false on any Vercel env or when Supabase env is set (`src/web/demo/flag.ts`, tested). Fixed ids: bets `…b001`–`…b008`, chats `…c001`/`…c002`. Add new screens by extending `WebData` in `src/web/data/types.ts` and both adapters.

## Verify before committing

`npm run typecheck && npm run lint && npm test`, then screenshots at 375 / 768 / 1440 (chrome-devtools MCP `emulate` viewports; fallback headless Chrome), zero console errors, Lighthouse mobile a11y/SEO/best-practices ≥ 90 on `/` and `/app`. Commit as Matthew Park; do not push.
