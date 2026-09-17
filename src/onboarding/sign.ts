import type { Store } from "@/src/db/store";
import type { Outbox } from "@/src/transport/outbox";
import { TERMS_VERSION } from "./terms";

/**
 * The sign sheet: who has signed in a chat, and what signing does. One
 * signature = name + number typed, both policies acknowledged. It creates
 * the user if the bot has not heard from them yet, records the e-sign row,
 * accepts the terms for them, and tells the chat.
 */
export interface SignInput {
  fullName: string;
  phone: string;
  signature: string;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  ip?: string;
  userAgent?: string;
}

export interface SignPage {
  chatId: string;
  members: Array<{ name: string; signed: boolean }>;
  termsVersion: number;
}

export type SignResult = { ok: true; name: string; signedCount: number; total: number } | { ok: false; error: string };

const PHONE = /^\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})$/;

/** US numbers typed any way people type them → E.164. */
export function normalizePhone(input: string): string | null {
  const m = input.trim().match(PHONE);
  return m ? `+1${m[1]}${m[2]}${m[3]}` : null;
}

export async function loadSignPage(store: Store, chatId: string): Promise<SignPage | null> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(chatId)) return null;
  const members = await store.chatMembers(chatId);
  if (!members.length) return null;
  const rows = await Promise.all(members.map(async (m) => ({ name: m.displayName ?? `…${m.phone.slice(-4)}`, signed: await store.hasAcceptedTerms(m.id, TERMS_VERSION) })));
  return { chatId, members: rows, termsVersion: TERMS_VERSION };
}

export async function signFromWeb(store: Store, outbox: Outbox, chatId: string, input: SignInput): Promise<SignResult> {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const phone = normalizePhone(input.phone);
  const signature = input.signature.trim();
  if (fullName.length < 2 || fullName.length > 60) return { ok: false, error: "type your name" };
  if (!phone) return { ok: false, error: "that number doesn't look right — use your full number" };
  if (signature.length < 2) return { ok: false, error: "sign with your name" };
  if (signature.toLowerCase().replace(/[^a-z]/g, "") !== fullName.toLowerCase().replace(/[^a-z]/g, "")) return { ok: false, error: "the signature has to match your name" };
  if (!input.agreeTerms || !input.agreePrivacy) return { ok: false, error: "you have to accept both to sign" };
  const members = await store.chatMembers(chatId);
  if (!members.length) return { ok: false, error: "this link isn't for a chat i'm in" };

  const user = await store.upsertUser(phone);
  await store.setDisplayName(user.id, fullName.split(" ")[0]);
  await store.upsertMember(chatId, user.id, phone);
  await store.recordSignature({ chatId, userId: user.id, phone, fullName, signature, termsVersion: TERMS_VERSION, ip: input.ip, userAgent: input.userAgent });
  await store.recordTermsAcceptance(user.id, TERMS_VERSION, "web");

  const after = await store.chatMembers(chatId);
  const signed = (await Promise.all(after.map((m) => store.hasAcceptedTerms(m.id, TERMS_VERSION)))).filter(Boolean).length;
  const first = fullName.split(" ")[0];
  await outbox.send(chatId, { text: `✍️ ${first} signed (${signed}/${after.length})${signed === after.length ? " — everyone's in, run it" : ""}` }, `signed:${chatId}:${user.id}:${TERMS_VERSION}`);
  return { ok: true, name: first, signedCount: signed, total: after.length };
}
