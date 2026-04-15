/**
 * Helpers for overlaying live Workshop data onto frozen LandingPage content.
 * LandingPage.content is a JSON snapshot set at auto-build time.
 * These helpers ensure live Workshop fields (format, venue, videoUrl) are
 * always current at render time.
 */

/**
 * Parses a JSON venue address object into a flat display string.
 * Workshop.venueAddress is stored as JSON: {"street":"...","city":"...","state":"...","zip":"..."}
 * Falls through to raw string if not valid JSON (legacy flat-string data).
 */
export function formatVenueAddress(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const a = JSON.parse(raw) as {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
  } catch {
    return raw; // legacy flat string — return as-is
  }
}

/**
 * Normalises a Vimeo URL to the embed format required by the iframe.
 * Converts https://vimeo.com/123456789 → https://player.vimeo.com/video/123456789
 * Leaves already-correct player.vimeo.com URLs unchanged.
 * Returns empty string for null/undefined input.
 */
export function normalizeVideoUrl(url: string | null | undefined): string {
  if (!url) return "";
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch && !url.includes("player.vimeo.com")) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return url;
}
