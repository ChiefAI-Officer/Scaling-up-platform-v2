/**
 * Assessment v7.6 — Runtime `ACCESS_POLICY_VERSION` flag.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md → "Rollback safety:
 * ACCESS_POLICY_VERSION (Round 1 H-1 + Round 3 H-3)".
 *
 * Three valid values:
 *   - "intersection" (default for v1) — INTERSECTION semantics.
 *   - "union"        (emergency revert) — UNION semantics.
 *   - "shadow-union" (canary) — INTERSECTION authoritative, also compute
 *     UNION and diff-log when results differ.
 *
 * Unknown / malformed values fall back to "intersection" (safe default —
 * never silently grant more access than the locked v1 semantics imply).
 */

import {
  ACCESS_POLICY_VERSIONS,
  getAccessPolicyVersion,
  isShadowMode,
  resetAccessPolicyVersionCache,
  type AccessPolicyVersion,
} from "@/lib/auth/access-policy-version";

const ORIGINAL_ENV = process.env.ACCESS_POLICY_VERSION;

function withEnv(value: string | undefined, fn: () => void) {
  if (value === undefined) {
    delete process.env.ACCESS_POLICY_VERSION;
  } else {
    process.env.ACCESS_POLICY_VERSION = value;
  }
  resetAccessPolicyVersionCache();
  try {
    fn();
  } finally {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ACCESS_POLICY_VERSION;
    } else {
      process.env.ACCESS_POLICY_VERSION = ORIGINAL_ENV;
    }
    resetAccessPolicyVersionCache();
  }
}

describe("access-policy-version", () => {
  afterAll(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ACCESS_POLICY_VERSION;
    } else {
      process.env.ACCESS_POLICY_VERSION = ORIGINAL_ENV;
    }
    resetAccessPolicyVersionCache();
  });

  it("exposes the three valid policy version constants", () => {
    expect(ACCESS_POLICY_VERSIONS).toEqual([
      "intersection",
      "union",
      "shadow-union",
    ]);
  });

  it("defaults to 'intersection' when env is unset", () => {
    withEnv(undefined, () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
    });
  });

  it("returns 'intersection' when ACCESS_POLICY_VERSION='intersection'", () => {
    withEnv("intersection", () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
    });
  });

  it("returns 'union' when ACCESS_POLICY_VERSION='union'", () => {
    withEnv("union", () => {
      expect(getAccessPolicyVersion()).toBe("union");
    });
  });

  it("returns 'shadow-union' when ACCESS_POLICY_VERSION='shadow-union'", () => {
    withEnv("shadow-union", () => {
      expect(getAccessPolicyVersion()).toBe("shadow-union");
    });
  });

  it("falls back to 'intersection' on unknown values (safe default)", () => {
    withEnv("aggressive-union", () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
    });
  });

  it("falls back to 'intersection' on empty string", () => {
    withEnv("", () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
    });
  });

  it("is case-sensitive (rejects 'INTERSECTION' uppercase)", () => {
    withEnv("INTERSECTION", () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
    });
  });

  it("isShadowMode returns true only when policy is 'shadow-union'", () => {
    withEnv("shadow-union", () => {
      expect(isShadowMode()).toBe(true);
    });
    withEnv("intersection", () => {
      expect(isShadowMode()).toBe(false);
    });
    withEnv("union", () => {
      expect(isShadowMode()).toBe(false);
    });
    withEnv(undefined, () => {
      expect(isShadowMode()).toBe(false);
    });
  });

  it("caches the resolved policy per-process (no env re-read after first call)", () => {
    withEnv("intersection", () => {
      expect(getAccessPolicyVersion()).toBe("intersection");
      // mutate env directly without resetting the cache
      process.env.ACCESS_POLICY_VERSION = "union";
      // cached value still wins
      expect(getAccessPolicyVersion()).toBe("intersection");
      // explicit reset honours the new value
      resetAccessPolicyVersionCache();
      expect(getAccessPolicyVersion()).toBe("union");
    });
  });

  it("idempotent — repeated calls return the same value", () => {
    withEnv("union", () => {
      const a: AccessPolicyVersion = getAccessPolicyVersion();
      const b: AccessPolicyVersion = getAccessPolicyVersion();
      const c: AccessPolicyVersion = getAccessPolicyVersion();
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(a).toBe("union");
    });
  });
});
