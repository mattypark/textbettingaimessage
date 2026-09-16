import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Supabase Auth hooks sign requests with the Standard Webhooks scheme:
 *   signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`))
 * The dashboard shows the secret as `v1,whsec_<base64>`; one or more
 * secrets may be comma-separated during rotation.
 */
export function verifyStandardWebhook(rawBody: string, headers: Record<string, string>, secrets: string, toleranceSeconds = 300): boolean {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

  const presented = signatureHeader
    .split(/\s+/)
    .map((part) => part.split(",")[1])
    .filter(Boolean)
    .map((sig) => Buffer.from(sig, "base64"));

  for (const raw of secrets.split(",")) {
    const secret = raw.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
    if (!secret) continue;
    const expected = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${timestamp}.${rawBody}`).digest();
    if (presented.some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected))) return true;
  }
  return false;
}
