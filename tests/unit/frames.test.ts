import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contactSheet, renderVideoFrames } from "@/src/proof/frames";

const exec = promisify(execFile);

async function syntheticMp4(seconds: number): Promise<Buffer> {
  const bin = ((await import("ffmpeg-static")) as unknown as { default: string }).default;
  const dir = await mkdtemp(path.join(tmpdir(), "vid-"));
  try {
    const out = path.join(dir, "t.mp4");
    await exec(bin, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=320x240:rate=10:duration=${seconds}`, "-pix_fmt", "yuv420p", out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("video frames", () => {
  it("renders evenly spaced frames plus a contact sheet from a short clip", async () => {
    const video = await syntheticMp4(3);
    const frames = await renderVideoFrames(video);
    expect(frames.length).toBeGreaterThanOrEqual(3); // sheet + ≥2 frames
    expect(frames.length).toBeLessThanOrEqual(9);
    const sheet = await sharp(frames[0]).metadata();
    expect(sheet.width).toBeGreaterThanOrEqual(384 * 2);
    const frame = await sharp(frames[1]).metadata();
    expect(frame.format).toBe("jpeg");
    expect(frame.width).toBe(768);
  }, 60_000);

  it("caps at 8 frames for long clips", async () => {
    const video = await syntheticMp4(20);
    const frames = await renderVideoFrames(video);
    expect(frames.length).toBe(9);
  }, 60_000);

  it("contactSheet tiles four per row", async () => {
    const tile = await sharp({ create: { width: 100, height: 60, channels: 3, background: "#f00" } }).jpeg().toBuffer();
    const sheet = await sharp(await contactSheet(Array(6).fill(tile))).metadata();
    expect(sheet.width).toBe(384 * 4);
    expect(sheet.height).toBe(384 * 2);
  });
});
