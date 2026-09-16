import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);

export const MAX_FRAMES = 8;
export const FRAME_WIDTH = 768;

async function ffmpegPath(): Promise<string> {
  const mod = (await import("ffmpeg-static")) as unknown as { default?: string } | string;
  const bin = typeof mod === "string" ? mod : mod.default;
  if (!bin) throw new Error("ffmpeg-static did not resolve a binary");
  return bin;
}

async function durationSeconds(bin: string, file: string): Promise<number> {
  // ffmpeg prints duration on stderr; no ffprobe in ffmpeg-static.
  const { stderr } = await exec(bin, ["-i", file, "-f", "null", "-"], { maxBuffer: 8 * 1024 * 1024 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = /Duration: (\d+):(\d+):(\d+\.?\d*)/.exec(stderr ?? "");
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Turns a short video into up to MAX_FRAMES evenly spaced JPEG frames plus
 * a contact sheet (all frames tiled, timestamps implied by order). Claude
 * has no native video input; frames are what the judge sees.
 */
export async function renderVideoFrames(video: Buffer, maxFrames = MAX_FRAMES): Promise<Buffer[]> {
  const bin = await ffmpegPath();
  const dir = await mkdtemp(path.join(tmpdir(), "proof-"));
  try {
    const input = path.join(dir, "in.bin");
    await writeFile(input, video);
    const seconds = await durationSeconds(bin, input);
    const count = Math.max(1, Math.min(maxFrames, Math.ceil(seconds || 1)));
    const fps = seconds > 0 ? count / seconds : 1;
    await exec(bin, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", input,
      "-vf", `fps=${fps},scale=${FRAME_WIDTH}:-2`,
      "-frames:v", String(count),
      "-q:v", "4",
      path.join(dir, "f-%02d.jpg"),
    ]);
    const files = (await readdir(dir)).filter((f) => f.startsWith("f-")).sort();
    const frames = await Promise.all(files.map((f) => readFile(path.join(dir, f))));
    if (frames.length === 0) return [];
    const sheet = await contactSheet(frames);
    return [sheet, ...frames];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Tiles frames left-to-right, wrapping every 4, so the judge sees the whole clip at once. */
export async function contactSheet(frames: Buffer[], perRow = 4, tile = 384): Promise<Buffer> {
  const rows = Math.ceil(frames.length / perRow);
  const cols = Math.min(perRow, frames.length);
  const resized = await Promise.all(frames.map((f) => sharp(f).resize(tile, tile, { fit: "inside", background: "#000" }).toBuffer()));
  const composites = await Promise.all(
    resized.map(async (buf, i) => {
      const meta = await sharp(buf).metadata();
      return { input: buf, left: (i % perRow) * tile + Math.floor((tile - (meta.width ?? tile)) / 2), top: Math.floor(i / perRow) * tile + Math.floor((tile - (meta.height ?? tile)) / 2) };
    })
  );
  return sharp({ create: { width: cols * tile, height: rows * tile, channels: 3, background: "#000" } })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();
}
