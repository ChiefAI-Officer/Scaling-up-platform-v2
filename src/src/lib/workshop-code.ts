/**
 * JV-03: Generate unique alphanumeric workshop codes
 * Format: WS-YYYY-XXXX (e.g., WS-2026-A1B2)
 * Used as human-readable identifier for cross-referencing workshops
 * with workflows, surveys, emails, and pages (JV-04).
 */

const ALPHANUMERIC_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes I, O, 0, 1 for readability

function generateRandomPart(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC_CHARS.charAt(
      Math.floor(Math.random() * ALPHANUMERIC_CHARS.length)
    );
  }
  return result;
}

export function generateWorkshopCode(): string {
  const year = new Date().getFullYear();
  const randomPart = generateRandomPart(4);
  return `WS-${year}-${randomPart}`;
}

/**
 * Generate a workshop code and verify uniqueness against the database.
 * Retries up to maxAttempts times if a collision is detected.
 */
export async function generateUniqueWorkshopCode(
  checkExists: (code: string) => Promise<boolean>,
  maxAttempts: number = 5
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateWorkshopCode();
    const exists = await checkExists(code);
    if (!exists) return code;
  }
  // Fallback: append timestamp fragment for guaranteed uniqueness
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `WS-${year}-${timestamp}`;
}
