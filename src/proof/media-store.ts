import type { SupabaseClient } from "@supabase/supabase-js";

/** Where proof bytes live. Provider URLs expire in minutes; this does not. */
export interface MediaStore {
  put(path: string, bytes: Buffer, mime: string): Promise<string>;
  get(path: string): Promise<Buffer>;
  /** Short-lived URL for the web app. */
  signedUrl(path: string, seconds: number): Promise<string>;
}

export class MemoryMediaStore implements MediaStore {
  readonly files = new Map<string, { bytes: Buffer; mime: string }>();

  async put(path: string, bytes: Buffer, mime: string): Promise<string> {
    this.files.set(path, { bytes, mime });
    return path;
  }

  async get(path: string): Promise<Buffer> {
    const file = this.files.get(path);
    if (!file) throw new Error(`no media at ${path}`);
    return file.bytes;
  }

  async signedUrl(path: string): Promise<string> {
    return `memory://${path}`;
  }
}

export const PROOFS_BUCKET = "proofs";

export class SupabaseMediaStore implements MediaStore {
  constructor(private readonly db: SupabaseClient) {}

  async put(path: string, bytes: Buffer, mime: string): Promise<string> {
    const { error } = await this.db.storage.from(PROOFS_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (error) throw new Error(`storage.upload: ${error.message}`);
    return path;
  }

  async get(path: string): Promise<Buffer> {
    const { data, error } = await this.db.storage.from(PROOFS_BUCKET).download(path);
    if (error || !data) throw new Error(`storage.download: ${error?.message ?? "empty"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async signedUrl(path: string, seconds: number): Promise<string> {
    const { data, error } = await this.db.storage.from(PROOFS_BUCKET).createSignedUrl(path, seconds);
    if (error || !data) throw new Error(`storage.signedUrl: ${error?.message ?? "empty"}`);
    return data.signedUrl;
  }
}
