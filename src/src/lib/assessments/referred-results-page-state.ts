export const MAX_PUBLIC_REFERRAL_CURSOR_TRAIL = 50;

const PUBLIC_REFERRAL_CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

/**
 * Cursor trails make later pages shareable while preserving Previous.
 * Reject the whole trail when it cannot be trusted as a bounded page index.
 */
export function normalizePublicReferralCursorTrail(
  value: string | string[] | undefined,
): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  if (raw.length > MAX_PUBLIC_REFERRAL_CURSOR_TRAIL) return [];

  const cursors = raw.map((cursor) => cursor.trim());
  if (
    cursors.some(
      (cursor) => !PUBLIC_REFERRAL_CURSOR_PATTERN.test(cursor),
    ) ||
    new Set(cursors).size !== cursors.length
  ) {
    return [];
  }

  return cursors;
}
