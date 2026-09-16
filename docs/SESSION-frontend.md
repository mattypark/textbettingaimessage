# Frontend session — rules of the lane

Owns: `app/(site)/**`, `app/app/**`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `src/web/**`, `public/**`.
Does not touch: `src/bets`, `src/ledger`, `src/agent`, `src/proof`, `src/inbound`, `supabase/**`, `app/api/**` — backend lane.

Design system (do not bleed another project's look in): tokens in `app/globals.css` — paper/ink/rule/stamp/locked/bubble; Instrument Serif display, Inter UI, JetBrains Mono numerals (`.num`); `.slip` perforated card; `.stamp`. Motion: GSAP + Lenis on the landing thread only; Framer Motion reserved for `/app` card interactions; `prefers-reduced-motion` honoured globally.

Verify at 375 / 768 / 1440 before calling anything done; Lighthouse mobile ≥ 90; no console errors.
