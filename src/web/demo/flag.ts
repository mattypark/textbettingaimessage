/**
 * WEB_DEMO=1 renders /app from seeded fixtures with no Supabase. It refuses
 * to switch on when any Vercel environment or any real Supabase config is
 * present, so it cannot leak into a deployment. Reads process.env directly
 * so src/config/env.ts stays untouched.
 */
export function isWebDemo(env: Record<string, string | undefined> = process.env): boolean {
  if (env.WEB_DEMO !== "1") return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  if (env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  return true;
}
