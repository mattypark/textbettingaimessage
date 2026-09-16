import { createHash } from "node:crypto";
import type { MediaStore } from "@/src/proof/media-store";
import type { InboundAttachmentRef, InboundEvent } from "./types";

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export interface StoredAttachment extends InboundAttachmentRef {
  storagePath: string;
  sha256: string;
  bytes: number;
}

const MAGIC: Array<[Buffer, number, string]> = [
  [Buffer.from([0xff, 0xd8, 0xff]), 0, "image/jpeg"],
  [Buffer.from("PNG"), 1, "image/png"],
  [Buffer.from("GIF8"), 0, "image/gif"],
  [Buffer.from("WEBP"), 8, "image/webp"],
  [Buffer.from("ftypheic"), 4, "image/heic"],
  [Buffer.from("ftypmif1"), 4, "image/heic"],
  [Buffer.from("ftypqt"), 4, "video/quicktime"],
  [Buffer.from("ftypisom"), 4, "video/mp4"],
  [Buffer.from("ftypmp4"), 4, "video/mp4"],
  [Buffer.from("ftypM4V"), 4, "video/x-m4v"],
];

/** Trust bytes over headers: providers sometimes label HEIC as jpeg or MOV as octet-stream. */
export function sniffMime(bytes: Buffer, fallback: string): string {
  for (const [sig, offset, mime] of MAGIC) {
    if (bytes.subarray(offset, offset + sig.length).equals(sig)) return mime;
  }
  return fallback;
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; body: Buffer }>;

export const defaultFetcher: Fetcher = async (url) => {
  const response = await fetch(url);
  return { ok: response.ok, status: response.status, body: Buffer.from(await response.arrayBuffer()) };
};

/**
 * Downloads every attachment on an inbound event into the media store and
 * returns refs carrying the storage path and hash. Runs inside the webhook,
 * before the 200, because the provider URL will be dead in 15 minutes.
 */
export async function storeAttachments(
  event: InboundEvent,
  media: MediaStore,
  fetcher: Fetcher = defaultFetcher
): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];
  for (const [index, ref] of event.attachments.entries()) {
    const { ok, status, body } = await fetcher(ref.url);
    if (!ok) throw new Error(`attachment download failed (${status}): ${ref.url}`);
    if (body.length > MAX_ATTACHMENT_BYTES) throw new Error(`attachment too large: ${body.length} bytes`);
    const mime = sniffMime(body, ref.mime);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const ext = mime.split("/")[1]?.replace("quicktime", "mov").replace("x-m4v", "m4v") ?? "bin";
    const storagePath = `${event.providerChatId}/${event.providerMessageId}/${index}.${ext}`;
    await media.put(storagePath, body, mime);
    stored.push({ ...ref, mime, storagePath, sha256, bytes: body.length });
  }
  return stored;
}
