/**
 * Helpers for overlaying live Workshop data onto frozen LandingPage content.
 * LandingPage.content is a JSON snapshot set at auto-build time.
 * These helpers ensure live Workshop fields (format, venue, videoUrl) are
 * always current at render time.
 */

export { formatVenueAddress } from "@/lib/templates/template-interpolation";

/**
 * Normalises a Vimeo URL to the embed format required by the iframe.
 * Converts https://vimeo.com/123456789 → https://player.vimeo.com/video/123456789
 * Private videos with a hash segment are also handled:
 *   https://vimeo.com/123456789/abc123def456 → https://player.vimeo.com/video/123456789/abc123def456
 * Leaves already-correct player.vimeo.com URLs unchanged.
 * Returns empty string for null/undefined input.
 * Note: Channel-style URLs (vimeo.com/channels/staffpicks/ID) are not supported
 * and will be returned unchanged. Only direct video URLs are converted.
 */
export function normalizeVideoUrl(url: string | null | undefined): string {
  if (!url) return "";
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+(?:\/[a-f0-9]+)?)/);
  if (vimeoMatch && !url.includes("player.vimeo.com")) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return url;
}
