import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window rolls over. */
  retryAfterSecs: number;
  /** This hit's position in the window (1 = first). `limit + 1` is the first refused one. */
  count: number;
}

/** Fixed-window counter. One `hit` = one request; the caller decides the key. */
export interface RateLimiter {
  hit(key: string, limit: number, windowSecs: number): Promise<RateLimitResult>;
}

/** Postgres-backed (migration 0010): the count is shared across every serverless instance. */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(private readonly db: SupabaseClient) {}

  async hit(key: string, limit: number, windowSecs: number): Promise<RateLimitResult> {
    const { data, error } = await this.db.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_secs: windowSecs }).single();
    if (error) throw new Error(`rate_limit_hit: ${error.message}`);
    const row = data as { allowed: boolean; retry_after_secs: number; hit_count: number };
    return { allowed: Boolean(row.allowed), retryAfterSecs: Number(row.retry_after_secs), count: Number(row.hit_count) };
  }
}

/** In-process fallback for dev without a database and for unit tests. Not shared across instances. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly clock: () => number = Date.now) {}

  async hit(key: string, limit: number, windowSecs: number): Promise<RateLimitResult> {
    const now = this.clock();
    const windowMs = windowSecs * 1000;
    const start = Math.floor(now / windowMs) * windowMs;
    const current = this.windows.get(key);
    const window = current && current.start === start ? current : { start, count: 0 };
    window.count += 1;
    this.windows.set(key, window);
    return { allowed: window.count <= limit, retryAfterSecs: Math.max(1, Math.ceil((start + windowMs - now) / 1000)), count: window.count };
  }
}

/**
 * Best-effort client address behind Vercel's proxy. `x-forwarded-for` is
 * client-controlled beyond the first hop, so only the first entry counts.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
