/**
 * Local stand-in for pg_cron: posts /api/cron/tick on an interval so the
 * outbox drains, judge jobs run and timeouts fire while `npm run dev` is up.
 *   npm run tick:dev
 * Env: TICK_URL (default http://localhost:3000/api/cron/tick),
 *      TICK_EVERY_MS (default 15000), CRON_SECRET (sent as the bearer).
 */
const url = process.env.TICK_URL ?? "http://localhost:3000/api/cron/tick";
const everyMs = Number(process.env.TICK_EVERY_MS ?? 15_000);
const secret = process.env.CRON_SECRET;

let running = false;

async function tickOnce(): Promise<void> {
  if (running) return; // a slow tick never overlaps the next one
  running = true;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
    const body = await response.text();
    const stamp = new Date().toISOString().slice(11, 19);
    if (!response.ok) {
      console.error(`[tick ${stamp}] HTTP ${response.status} ${body.slice(0, 200)}`);
      return;
    }
    const report = JSON.parse(body) as Record<string, unknown>;
    const { timeouts, ...rest } = report;
    const summary = Object.entries(rest)
      .filter(([, v]) => typeof v === "number" && v !== 0)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    const timeoutSummary = timeouts && typeof timeouts === "object"
      ? Object.entries(timeouts as Record<string, unknown>).filter(([, v]) => v !== 0).map(([k, v]) => `timeouts.${k}=${v}`).join(" ")
      : "";
    console.info(`[tick ${stamp}] ${[summary, timeoutSummary].filter(Boolean).join(" ") || "idle"} (${Date.now() - started} ms)`);
  } catch (error) {
    console.error(`[tick] ${error instanceof Error ? error.message : String(error)} — is npm run dev up?`);
  } finally {
    running = false;
  }
}

console.info(`[tick] posting ${url} every ${everyMs} ms${secret ? " with CRON_SECRET" : " (no CRON_SECRET; dev route allows it)"}`);
void tickOnce();
setInterval(() => void tickOnce(), everyMs);
