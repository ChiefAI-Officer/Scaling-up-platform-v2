/**
 * Assessment v7.6 — Runtime `ACCESS_POLICY_VERSION` feature flag.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md → "Rollback safety:
 * ACCESS_POLICY_VERSION (Round 1 H-1 + Round 3 H-3)".
 *
 * The RBAC policy is gated by a runtime env flag (NOT a code constant) so
 * that an incorrect policy can be flipped on Vercel without a code deploy.
 *
 *   - "intersection" (default for v1): every group the coach belongs to
 *     MUST grant a template for the coach to access it.
 *   - "union"        (emergency revert): any single group granting the
 *     template is enough.
 *   - "shadow-union" (canary):  INTERSECTION authoritative, also computes
 *     UNION and emits a structured-log entry when results differ.
 *
 * Unknown / empty / malformed values fall back to "intersection" — the
 * safe default that never silently grants more access than v1 implies.
 *
 * Cached per-process for hot-path callers (`canAccessTemplate` is hit on
 * every admin list render). Call `resetAccessPolicyVersionCache()` after
 * env mutation in tests or after a Vercel env update if the process did
 * NOT recycle.
 */

export const ACCESS_POLICY_VERSIONS = [
  "intersection",
  "union",
  "shadow-union",
] as const;

export type AccessPolicyVersion = (typeof ACCESS_POLICY_VERSIONS)[number];

const VALID_SET: ReadonlySet<string> = new Set(ACCESS_POLICY_VERSIONS);

let cached: AccessPolicyVersion | null = null;

/**
 * Resolve the active access-policy version. Reads `process.env` on first
 * call, caches per-process. Unknown values fall back to "intersection".
 */
export function getAccessPolicyVersion(): AccessPolicyVersion {
  if (cached !== null) {
    return cached;
  }

  const raw = process.env.ACCESS_POLICY_VERSION;
  if (typeof raw === "string" && VALID_SET.has(raw)) {
    cached = raw as AccessPolicyVersion;
  } else {
    cached = "intersection";
  }
  return cached;
}

/**
 * True when the active policy is "shadow-union" — INTERSECTION is
 * authoritative but UNION runs in parallel for divergence logging.
 */
export function isShadowMode(): boolean {
  return getAccessPolicyVersion() === "shadow-union";
}

/**
 * Test-only / operator-only: drop the cached value so the next call
 * re-reads `process.env`. Production code should never call this; rely on
 * normal process recycling on Vercel redeploy instead.
 */
export function resetAccessPolicyVersionCache(): void {
  cached = null;
}
