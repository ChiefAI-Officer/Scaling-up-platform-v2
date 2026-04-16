/**
 * Helpers for overlaying live Workshop data onto frozen LandingPage content.
 * LandingPage.content is a JSON snapshot set at auto-build time.
 * These helpers ensure live Workshop fields (format, venue, videoUrl) are
 * always current at render time.
 */

export { formatVenueAddress } from "@/lib/templates/template-interpolation";

/**
 * Normalises a video URL to the embed format required by the iframe.
 *
 * Vimeo:
 *   https://vimeo.com/123456789 → https://player.vimeo.com/video/123456789
 *   Private videos with a hash segment are also handled:
 *   https://vimeo.com/123456789/abc123def456 → https://player.vimeo.com/video/123456789/abc123def456
 *   Leaves already-correct player.vimeo.com URLs unchanged.
 *   Note: Channel-style URLs (vimeo.com/channels/staffpicks/ID) are not supported
 *   and will be returned unchanged. Only direct video URLs are converted.
 *
 * YouTube:
 *   https://www.youtube.com/watch?v=ID → https://www.youtube.com/embed/ID
 *   https://youtu.be/ID → https://www.youtube.com/embed/ID
 *   https://www.youtube.com/embed/ID → unchanged (already embed format)
 *
 * Returns empty string for null/undefined input.
 * Unknown formats are returned unchanged.
 */
export function normalizeVideoUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Vimeo — handles private video URLs (vimeo.com/ID or vimeo.com/ID/hash)
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+(?:\/[a-f0-9]+)?)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // YouTube — handles watch URLs (youtube.com/watch?v=ID), short URLs (youtu.be/ID),
  // and already-embedded URLs (youtube.com/embed/ID)
  const youtubeMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  return url; // Unknown format — pass through unchanged
}
