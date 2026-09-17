/**
 * The public site URL, resolved once for every server module that builds a
 * link or metadata. Order: an explicit NEXT_PUBLIC_SITE_URL, then the
 * production domain Vercel assigns, then the deployment's own URL, then
 * localhost. Blank values count as unset, so an empty Vercel env var never
 * breaks the build.
 */
function present(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function siteUrl(): string {
  const explicit = present(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit.replace(/\/$/, "");
  const production = present(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return `https://${production}`;
  const deployment = present(process.env.VERCEL_URL);
  if (deployment) return `https://${deployment}`;
  return "http://localhost:3000";
}
