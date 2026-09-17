/**
 * rate_limit_hit against Postgres: the window is shared, the sixth hit in an
 * hour is refused, and Retry-After is sane.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { SupabaseRateLimiter } from "@/src/access/rate-limit";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

describe.skipIf(!enabled)("rate_limit_hit (Postgres)", () => {
  let db: SupabaseClient;
  beforeAll(() => {
    db = createClient(url ?? "", key ?? "", { auth: { persistSession: false } });
  });

  it("refuses the sixth hit in the window and reports retry-after", async () => {
    const limiter = new SupabaseRateLimiter(db);
    const k = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 5; i++) expect((await limiter.hit(k, 5, 3600)).allowed).toBe(true);
    const sixth = await limiter.hit(k, 5, 3600);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSecs).toBeGreaterThan(0);
    expect(sixth.retryAfterSecs).toBeLessThanOrEqual(3600);
    expect((await limiter.hit(`${k}:other`, 5, 3600)).allowed).toBe(true);
  });
});
