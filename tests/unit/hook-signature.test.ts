import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStandardWebhook } from "@/src/auth/hook-signature";

const secretB64 = Buffer.from("super-secret-key-material-32bytes!!").toString("base64");
const secret = `v1,whsec_${secretB64}`;

function sign(body: string, id: string, ts: number, key = secretB64) {
  return "v1," + createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
}

describe("verifyStandardWebhook", () => {
  const body = JSON.stringify({ user: { phone: "15551234567" }, sms: { otp: "123456" } });
  const now = Math.floor(Date.now() / 1000);

  it("accepts a valid signature and rejects tampering, stale timestamps, and wrong keys", () => {
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": String(now), "webhook-signature": sign(body, "msg_1", now) };
    expect(verifyStandardWebhook(body, headers, secret)).toBe(true);
    expect(verifyStandardWebhook(body + " ", headers, secret)).toBe(false);
    expect(verifyStandardWebhook(body, { ...headers, "webhook-timestamp": String(now - 3600), "webhook-signature": sign(body, "msg_1", now - 3600) }, secret)).toBe(false);
    expect(verifyStandardWebhook(body, headers, `v1,whsec_${Buffer.from("other").toString("base64")}`)).toBe(false);
    expect(verifyStandardWebhook(body, {}, secret)).toBe(false);
  });

  it("accepts any of several comma-separated secrets during rotation", () => {
    const headers = { "webhook-id": "m", "webhook-timestamp": String(now), "webhook-signature": sign(body, "m", now) };
    expect(verifyStandardWebhook(body, headers, `v1,whsec_${Buffer.from("old").toString("base64")},${secret}`)).toBe(true);
  });
});
