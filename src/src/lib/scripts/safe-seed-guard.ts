/**
 * safe-seed-guard.ts
 *
 * Pure guard functions for safe-seed.mjs.
 *
 * Exported as a TypeScript module so Jest tests can import them directly
 * without needing to load the .mjs ESM entrypoint. The .mjs script imports
 * from this file via a require/dynamic-import shim.
 *
 * No side effects — all functions are pure and unit-testable without a DB.
 */

export const OVERRIDE_FLAG = "--i-know-this-is-prod";

/**
 * Parse the hostname from a DATABASE_URL / PostgreSQL connection string.
 * Returns an empty string if the URL is falsy or unparseable.
 */
export function parseHost(url: string | undefined): string {
  if (!url) return "";
  const noProto = url.replace(/^[a-z]+:\/\//i, "");
  const afterAt = noProto.includes("@") ? noProto.split("@")[1] : noProto;
  const hostPort = (afterAt ?? "").split("/")[0];
  return hostPort.split(":")[0] ?? "";
}

/**
 * Return true when the URL looks like a Neon/production host.
 * Mirrors the heuristic in safe-prisma.mjs.
 */
export function looksLikeProd(url: string | undefined): boolean {
  return /neon\.tech|neon\.dev/i.test(url ?? "");
}

export interface GuardInput {
  url: string;
  expectedHost: string | undefined;
  hasOverride: boolean;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Core guard logic — pure function, no I/O, returns a decision object.
 *
 * Decision matrix:
 *
 *   DATABASE_URL host | hasOverride | expectedHost              | Result
 *   ──────────────────┼─────────────┼───────────────────────────┼──────────────────────────────────────────────────────
 *   Neon/prod         | false       | any                       | BLOCKED — add flag
 *   Neon/prod         | true        | unset                     | ALLOWED (flag alone sufficient)
 *   Neon/prod         | true        | set, matches actual host  | ALLOWED
 *   Neon/prod         | true        | set, does NOT match       | BLOCKED — host mismatch (wrong DB)
 *   dev host          | false       | unset                     | ALLOWED (normal dev path)
 *   dev host          | false       | set, matches actual host  | BLOCKED — dev run on expected-prod host
 *   dev host          | false       | set, does NOT match       | ALLOWED (dev .env pointing elsewhere)
 *   dev host          | true        | any                       | ALLOWED (operator explicitly overriding)
 */
export function checkGuard({ url, expectedHost, hasOverride }: GuardInput): GuardResult {
  const actualHost = parseHost(url);
  const isProd = looksLikeProd(url);

  if (isProd) {
    // Prod host requires the override flag.
    if (!hasOverride) {
      return {
        allowed: false,
        reason:
          `DATABASE_URL points at a Neon/prod host ("${actualHost}"). ` +
          `Refusing to seed without explicit confirmation.\n` +
          `Re-run with: node scripts/safe-seed.mjs <target> ${OVERRIDE_FLAG}`,
      };
    }

    // Override present — if ASSESSMENT_PROD_EXPECTED_HOST is set, enforce it.
    if (expectedHost) {
      if (actualHost !== expectedHost) {
        return {
          allowed: false,
          reason:
            `Host fingerprint MISMATCH.\n` +
            `  expected (ASSESSMENT_PROD_EXPECTED_HOST): ${expectedHost}\n` +
            `  actual (from DATABASE_URL):               ${actualHost}\n` +
            `This looks like the wrong database. Aborting seed.`,
        };
      }
    }

    return { allowed: true };
  }

  // Dev host path.
  if (!hasOverride && expectedHost && actualHost === expectedHost) {
    // A dev invocation (no override) where the DATABASE_URL host MATCHES the
    // expected prod host — the local .env must be pointing at prod.
    return {
      allowed: false,
      reason:
        `BLOCKED — dev dry-run: DATABASE_URL host ("${actualHost}") matches ` +
        `ASSESSMENT_PROD_EXPECTED_HOST. This .env is pointed at production.\n` +
        `If you intended a prod seed, add: ${OVERRIDE_FLAG}`,
    };
  }

  return { allowed: true };
}
