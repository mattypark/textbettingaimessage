import { describe, expect, it } from "vitest";
import { clientIp, MemoryRateLimiter } from "@/src/access/rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit inside a window, then blocks until it rolls", async () => {
    let now = Date.UTC(2026, 8, 17, 12, 0, 0);
    const limiter = new MemoryRateLimiter(() => now);
    for (let i = 0; i < 5; i++) expect((await limiter.hit("join:ip:1.1.1.1", 5, 3600)).allowed).toBe(true);
    const sixth = await limiter.hit("join:ip:1.1.1.1", 5, 3600);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSecs).toBe(3600);

    now += 59 * 60 * 1000;
    expect((await limiter.hit("join:ip:1.1.1.1", 5, 3600)).allowed).toBe(false);
    now += 60 * 1000 + 1;
    expect((await limiter.hit("join:ip:1.1.1.1", 5, 3600)).allowed).toBe(true);
  });

  it("keeps keys independent", async () => {
    const limiter = new MemoryRateLimiter(() => 0);
    for (let i = 0; i < 5; i++) await limiter.hit("join:ip:a", 5, 3600);
    expect((await limiter.hit("join:ip:a", 5, 3600)).allowed).toBe(false);
    expect((await limiter.hit("join:phone:+15550001", 5, 3600)).allowed).toBe(true);
    expect((await limiter.hit("join:ip:b", 5, 3600)).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded hop, then x-real-ip, then unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
