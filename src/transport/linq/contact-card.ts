import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { linqClient } from "./client";

/**
 * The bot's contact card (vCard with name + avatar). iMessage shows a bare
 * number until the person saves the contact, so the intro carries this file
 * and one tap on "Add" turns "+1 (205) 396-8556" into "Mushy" with the mark,
 * the way Instinct shows up. Uploaded once per process, then reused by id.
 */
const AVATAR_PATH = join(process.cwd(), "public", "brand", "mushy-mark-512.png");

export function buildVCard({ name, phone, avatarPng }: { name: string; phone: string; avatarPng: Buffer | null }): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${name};;;`,
    `FN:${name}`,
    `ORG:${name}`,
    `TEL;TYPE=CELL,VOICE:${phone}`,
    "NOTE:Group-chat betting bot. Text \"hey mushy\" in a chat I'm in.",
  ];
  if (avatarPng) {
    // vCard 3.0 folds long lines at 75 octets with a leading space.
    const b64 = avatarPng.toString("base64");
    const first = `PHOTO;ENCODING=b;TYPE=PNG:${b64.slice(0, 40)}`;
    const rest = b64.slice(40).match(/.{1,74}/g) ?? [];
    lines.push(first, ...rest.map((chunk) => ` ${chunk}`));
  }
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

let uploaded: Promise<string> | undefined;

/** Uploads the card to Linq once and returns its permanent attachment id. */
export function contactCardAttachmentId(name: string, phone: string): Promise<string> {
  uploaded ??= upload(name, phone).catch((error) => {
    uploaded = undefined; // let the next intro retry
    throw error;
  });
  return uploaded;
}

async function upload(name: string, phone: string): Promise<string> {
  const avatarPng = await readFile(AVATAR_PATH).catch(() => null);
  const body = Buffer.from(buildVCard({ name, phone, avatarPng }), "utf8");
  const created = await linqClient().attachments.create({
    filename: `${name.toLowerCase()}.vcf`,
    content_type: "text/vcard",
    size_bytes: body.byteLength,
  });
  const response = await fetch(created.upload_url, { method: "PUT", headers: created.required_headers as Record<string, string>, body });
  if (!response.ok) throw new Error(`contact card upload failed (${response.status})`);
  return created.attachment_id;
}

/** Test hook. */
export function resetContactCardCache(): void {
  uploaded = undefined;
}
