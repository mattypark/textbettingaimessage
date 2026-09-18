import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/src/config/env";
import { addSharedLineContact, sharedLineEnabled } from "@/src/transport/linq/contacts";

const saved = { org: process.env.LINQ_ORG_ID, key: process.env.LINQ_API_KEY };

function withLine(orgId?: string, apiKey?: string) {
  if (orgId) process.env.LINQ_ORG_ID = orgId;
  else delete process.env.LINQ_ORG_ID;
  if (apiKey) process.env.LINQ_API_KEY = apiKey;
  else delete process.env.LINQ_API_KEY;
  resetEnvCache();
}

describe("shared-line contacts", () => {
  afterEach(() => {
    withLine(saved.org, saved.key);
    vi.unstubAllGlobals();
  });

  it("is off without an org id, and posts the number when configured", async () => {
    withLine(undefined, "key");
    expect(sharedLineEnabled()).toBe(false);
    expect(await addSharedLineContact("+17135550100")).toMatchObject({ ok: false });

    withLine("org-1", "key");
    expect(sharedLineEnabled()).toBe(true);
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    });
    expect(await addSharedLineContact("+17135550100")).toEqual({ ok: true, added: true });
    expect(calls[0][0]).toMatch(/\/cli\/contacts\/add$/);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ orgId: "org-1", contactPhone: "+17135550100" });
    expect((calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("refuses a malformed number and survives a failing request", async () => {
    withLine("org-1", "key");
    expect(await addSharedLineContact("713-555-0100")).toMatchObject({ ok: false, error: /E.164/ });
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
    expect(await addSharedLineContact("+17135550100")).toMatchObject({ ok: false, error: "linq contacts add 500" });
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await addSharedLineContact("+17135550100")).toMatchObject({ ok: false, error: "offline" });
  });
});
