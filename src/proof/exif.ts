import exifr from "exifr";

export interface ExifSummary {
  capturedAt?: string;
  make?: string;
  model?: string;
  software?: string;
  gps?: { lat: number; lng: number };
}

/**
 * Soft signals only. iMessage "low quality" mode and screenshots strip EXIF,
 * so absence proves nothing; a capture time after the deadline is the one
 * hard check the judge can lean on.
 */
export async function readExif(bytes: Buffer): Promise<ExifSummary> {
  try {
    const tags = (await exifr.parse(bytes, { pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "Software", "latitude", "longitude"] })) as
      | Record<string, unknown>
      | undefined;
    if (!tags) return {};
    const when = (tags.DateTimeOriginal ?? tags.CreateDate) as Date | string | undefined;
    const capturedAt = when instanceof Date ? when.toISOString() : typeof when === "string" ? new Date(when).toISOString() : undefined;
    const lat = typeof tags.latitude === "number" ? tags.latitude : undefined;
    const lng = typeof tags.longitude === "number" ? tags.longitude : undefined;
    return {
      capturedAt: capturedAt && !Number.isNaN(Date.parse(capturedAt)) ? capturedAt : undefined,
      make: typeof tags.Make === "string" ? tags.Make : undefined,
      model: typeof tags.Model === "string" ? tags.Model : undefined,
      software: typeof tags.Software === "string" ? tags.Software : undefined,
      gps: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
    };
  } catch {
    return {};
  }
}
