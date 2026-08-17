export const MARKETING_CTA_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const MARKETING_CTA_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function sanitizeMarketingCtaFilename(name: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return safe || "image";
}
