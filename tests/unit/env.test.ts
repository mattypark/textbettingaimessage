import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/src/config/env";

const keys = ["NEXT_PUBLIC_SUPABASE_URL", "MODEL_PROVIDER", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_MODEL"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

describe("env", () => {
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetEnvCache();
  });

  it("treats blank template values as unset instead of failing validation", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.MODEL_PROVIDER = "";
    process.env.OPENAI_API_KEY = "";
    resetEnvCache();
    const e = env();
    expect(e.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(e.MODEL_PROVIDER).toBeUndefined();
    expect(e.OPENAI_API_KEY).toBeUndefined();
    expect(e.OPENAI_MODEL).toBe("gpt-5");
  });

  it("still rejects a malformed Supabase URL with a readable message", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "bbyerhmjagtdsjlnkzkl.supabase.co";
    resetEnvCache();
    expect(() => env()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
