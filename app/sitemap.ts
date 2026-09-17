import type { MetadataRoute } from "next";

import { siteUrl } from "@/src/config/site";
const SITE = siteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/join", "/terms", "/privacy"].map((path) => ({ url: `${SITE}${path}`, lastModified: new Date("2026-09-16") }));
}
