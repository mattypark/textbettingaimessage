import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "@/src/config/site";

const keys = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

describe("siteUrl", () => {
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("prefers the explicit value, falls back to Vercel's production and deployment hosts, never breaks on blank", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "mushy.vercel.app";
    process.env.VERCEL_URL = "mushy-abc123.vercel.app";
    expect(siteUrl()).toBe("https://mushy.vercel.app");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(siteUrl()).toBe("https://mushy-abc123.vercel.app");
    process.env.NEXT_PUBLIC_SITE_URL = "https://mushy.bet/";
    expect(siteUrl()).toBe("https://mushy.bet");
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
    expect(() => new URL(siteUrl())).not.toThrow();
  });
});
