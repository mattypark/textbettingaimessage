# Backend session — rules of the lane

Owns: `src/**` except `src/web`, `supabase/**`, `app/api/**`, `scripts/**`, `tests/**`.
Does not touch: `app/(site)`, `app/app`, `app/globals.css`, `app/layout.tsx`, `src/web` — that is the frontend lane.

Contracts the frontend relies on (change = coordinate first):
- Postgres RLS + RPCs `my_wallet()`, `accept_terms_web(p_version)`, `my_user_id()` (migration 0008).
- `bets.state` jsonb document shape = `Bet` in `src/bets/types.ts` (bigint stakes serialized as strings).
- `/api/media/[proofId]` redirect contract, `/api/auth/send-sms` hook.

Standing rules: outbox for every send; points only; every ledger/state-machine change lands with tests run and quoted (`npm test`, `npm run test:integration` when Supabase local is up).
