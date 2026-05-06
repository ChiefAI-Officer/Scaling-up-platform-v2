/**
 * Helpers for overlaying live Workshop data onto frozen LandingPage content.
 * LandingPage.content is a JSON snapshot set at auto-build time.
 * These helpers ensure live Workshop fields (format, venue, videoUrl) are
 * always current at render time.
 */

export { formatVenueAddress } from "@/lib/templates/template-interpolation";

/**
 * Normalises a video URL to the canonical embed format required by the iframe.
 *
 * Vimeo (canonical embed URL is query-form `?h=HASH` per Vimeo docs;
 * path-form HASH 410s on the player domain for unlisted videos):
 *   https://vimeo.com/ID                  → https://player.vimeo.com/video/ID
 *   https://vimeo.com/ID/HASH             → https://player.vimeo.com/video/ID?h=HASH
 *   https://vimeo.com/ID?h=HASH           → https://player.vimeo.com/video/ID?h=HASH
 *   https://player.vimeo.com/video/ID     → unchanged
 *   https://player.vimeo.com/video/ID?h=H → unchanged
 *   Channel-style URLs (vimeo.com/channels/...) are not supported and pass through.
 *
 * YouTube:
 *   https://www.youtube.com/watch?v=ID → https://www.youtube.com/embed/ID
 *   https://youtu.be/ID → https://www.youtube.com/embed/ID
 *   https://www.youtube.com/embed/ID → unchanged (already embed format)
 *
 * Returns empty string for null/undefined input.
 * Unknown formats are returned unchanged. Function is idempotent.
 */
export function normalizeVideoUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Vimeo — captures: (1) ID, (2) path-form HASH, (3) query-form HASH.
  // Optional `video/` prefix lets us also match player.vimeo.com URLs.
  const vimeoMatch = url.match(
    /vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-f0-9]+)|\?h=([a-f0-9]+))?/
  );
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    const hash = vimeoMatch[2] || vimeoMatch[3];
    return hash
      ? `https://player.vimeo.com/video/${id}?h=${hash}`
      : `https://player.vimeo.com/video/${id}`;
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
