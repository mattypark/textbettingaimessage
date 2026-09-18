import { env } from "@/src/config/env";

/**
 * Shared-line contact list. On Linq's free tier the line only routes
 * numbers on this list, so a friend who hasn't been added is invisible to
 * the webhook — their texts never arrive. The CLI's `linq contacts add`
 * posts to this endpoint; doing it from the bot means nobody types a
 * command: when someone signs on the web we already have their number.
 *
 * Off unless LINQ_ORG_ID is set. A dedicated line (`linq upgrade`) has no
 * contact list at all and makes this a no-op.
 */
const BACKEND = process.env.LINQ_BACKEND_URL ?? "https://prod.zero-service.linqapp.com";

export type ContactResult = { ok: true; added: boolean } | { ok: false; error: string };

export function sharedLineEnabled(): boolean {
  return Boolean(env().LINQ_ORG_ID && env().LINQ_API_KEY);
}

/** Idempotent: adding a number that is already a contact succeeds. */
export async function addSharedLineContact(phone: string): Promise<ContactResult> {
  const { LINQ_ORG_ID: orgId, LINQ_API_KEY: token } = env();
  if (!orgId || !token) return { ok: false, error: "shared-line contacts are off (no LINQ_ORG_ID)" };
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return { ok: false, error: `not an E.164 number: ${phone}` };

  try {
    const response = await fetch(`${BACKEND}/cli/contacts/add`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId, contactPhone: phone }),
    });
    if (!response.ok) return { ok: false, error: `linq contacts add ${response.status}` };
    return { ok: true, added: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Never throws: registration failing must not block a signature or a reply. */
export async function tryRegisterContact(phone: string, log: (line: string) => void = () => undefined): Promise<void> {
  if (!sharedLineEnabled()) return;
  const result = await addSharedLineContact(phone);
  log(result.ok ? `registered ${phone.slice(-4)} on the shared line` : `contact add failed: ${result.error}`);
}
