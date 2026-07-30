/**
 * Shared https-only image-src gate.
 *
 * Extracted from `invitation-email.ts` (which re-exports it, so its existing
 * import surface is unchanged) for one reason: `CoachLogo` needs this gate, and
 * `CoachLogo` is reached from `public-quiz-client.tsx`, a CLIENT component.
 * Importing the email module there would pull the email HTML sanitizer and the
 * logo-CID constant into a respondent-facing client bundle. A single tiny module
 * keeps ONE implementation — the alternative, a second copy inside the
 * component, is exactly the kind of duplicate that drifts.
 */

/**
 * Returns a safe image src or null — STRICTER than a general href gate: HTTPS
 * only (the email sanitizer already strips http: images — stay consistent).
 * Rejects http:, javascript:, data:, protocol-relative, root-relative, bare
 * filenames, empty/null, and anything `new URL` cannot parse.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
