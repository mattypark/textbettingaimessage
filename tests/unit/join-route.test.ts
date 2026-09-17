/**
 * POST /api/join with the in-memory stores (no Supabase in the test env):
 * the sixth call from one address, or for one phone, gets a 429.
 */
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/join/route";

const call = (ip: string, phone: string) =>
  POST(
    new Request("http://localhost/api/join", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ phone }),
    }),
  );

describe("POST /api/join rate limit", () => {
  it("lets five joins through per address, then answers 429 with retry-after", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await call("203.0.113.10", `+1555000${1000 + i}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "waitlist" });
    }
    const blocked = await call("203.0.113.10", "+15550009999");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await blocked.json()).error).toMatch(/slow down/);
  });

  it("limits one phone across addresses", async () => {
    for (let i = 0; i < 5; i++) expect((await call(`198.51.100.${i}`, "+15550007777")).status).toBe(200);
    const blocked = await call("198.51.100.99", "+15550007777");
    expect(blocked.status).toBe(429);
    // A different phone from that last address is still fine.
    expect((await call("198.51.100.99", "+15550007778")).status).toBe(200);
  });

  it("still validates the body after the address check", async () => {
    const res = await POST(new Request("http://localhost/api/join", { method: "POST", headers: { "x-forwarded-for": "192.0.2.1" }, body: "{}" }));
    expect(res.status).toBe(400);
  });
});
