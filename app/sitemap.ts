import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/terms", "/privacy"].map((path) => ({ url: `${SITE}${path}`, lastModified: new Date("2026-09-16") }));
}
