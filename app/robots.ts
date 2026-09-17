import type { MetadataRoute } from "next";

import { siteUrl } from "@/src/config/site";
const SITE = siteUrl();

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api"] }], sitemap: `${SITE}/sitemap.xml` };
}
