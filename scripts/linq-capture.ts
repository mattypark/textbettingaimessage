/**
 * Stage 0 helper: a second webhook listener that saves every raw Linq
 * payload into tests/fixtures/linq/ with phone numbers redacted, and can
 * forward the untouched request on to the app so one `linq webhooks listen`
 * feeds both.
 *
 *   npm run linq:capture
 *   linq webhooks listen --forward-to http://localhost:3001 --events ...
 *
 * Env: LINQ_CAPTURE_PORT (3001), LINQ_CAPTURE_FORWARD (set to
 * http://localhost:3000/api/webhooks/linq to tee into the app).
 */
import { createServer } from "node:http";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.LINQ_CAPTURE_PORT ?? 3001);
const forward = process.env.LINQ_CAPTURE_FORWARD;
const dir = join(process.cwd(), "tests", "fixtures", "linq");
mkdirSync(dir, { recursive: true });

/** The bot line is public (landing-page CTA); everyone else maps to the fixture pool. */
const BOT_NUMBER = "+12053968556";
const POOL = ["+17135550100", "+17135550101", "+17135550102", "+17135550103", "+17135550104", "+17135550105"];
const redactions = new Map<string, string>();

function redactNumber(real: string): string {
  if (real === BOT_NUMBER) return real;
  let fake = redactions.get(real);
  if (!fake) {
    fake = POOL[redactions.size] ?? `+1713555${String(redactions.size).padStart(4, "0")}`;
    redactions.set(real, fake);
  }
  return fake;
}

/** E.164 numbers anywhere in the JSON text; then the bare 10/11-digit forms of the same numbers. */
function redact(json: string): string {
  let out = json.replace(/\+1\d{10}\b/g, (m) => redactNumber(m));
  for (const [real, fake] of redactions) {
    const digits = real.slice(2);
    out = out.replace(new RegExp(`(?<![\\d+])1?${digits}(?!\\d)`, "g"), (m) => (m.startsWith("1") ? "1" : "") + fake.slice(2));
  }
  return out;
}

function nextName(eventType: string): string {
  const base = `live-${eventType.replace(/\./g, "-")}`;
  const existing = readdirSync(dir).filter((f) => f.startsWith(base)).length;
  return `${base}-${String(existing + 1).padStart(2, "0")}.json`;
}

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let eventType = "unknown";
    try {
      const parsed = JSON.parse(raw) as { event_type?: string; data?: { direction?: string; is_from_me?: boolean } };
      eventType = parsed.event_type ?? "unknown";
      const pretty = JSON.stringify(JSON.parse(redact(raw)), null, 2) + "\n";
      const name = nextName(eventType);
      writeFileSync(join(dir, name), pretty);
      const dir_ = parsed.data?.direction ?? (parsed.data?.is_from_me ? "outbound" : "inbound");
      console.info(`[capture] ${eventType} (${dir_}) → ${name}`);
    } catch (error) {
      console.error(`[capture] not JSON or write failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (forward) {
      try {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
        delete headers.host;
        delete headers["content-length"];
        const upstream = await fetch(forward, { method: "POST", headers, body: raw });
        const body = await upstream.text();
        console.info(`[capture] forwarded → ${upstream.status} ${body.slice(0, 160)}`);
        res.writeHead(upstream.status, { "content-type": "application/json" });
        res.end(body);
        return;
      } catch (error) {
        console.error(`[capture] forward failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
});

server.listen(port, () => {
  console.info(`[capture] listening on http://localhost:${port} → ${dir}${forward ? ` (forwarding to ${forward})` : ""}`);
  console.info(`[capture] point the CLI here: linq webhooks listen --forward-to http://localhost:${port} --events message.received,reaction.added,reaction.removed,participant.added,chat.created`);
});
