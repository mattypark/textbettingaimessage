import { createHash } from "node:crypto";
import sharp from "sharp";

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 64-bit average hash: downscale to 8x8 grayscale, 1 bit per pixel above the
 * mean. Re-encoded or resized copies of the same photo land within a few
 * bits of each other; different photos are ~32 bits apart.
 */
export async function averageHash(imageBytes: Buffer): Promise<string> {
  const { data } = await sharp(imageBytes).grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
  let bits = 0n;
  for (const v of data) bits = (bits << 1n) | (v > mean ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Below this many differing bits two images count as the same shot.
 * Re-encodes/resizes of one photo measure 0–8 bits apart; unrelated photos
 * of similar scenes sit around 20–32.
 */
export const NEAR_DUPLICATE_BITS = 10;
