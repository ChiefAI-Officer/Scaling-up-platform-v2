/**
 * Tests for safe-seed.mjs guard logic.
 *
 * Tests the pure `checkGuard()` export directly (no DB, no child process)
 * and the `parseHost()` / `looksLikeProd()` helpers to lock the decision
 * matrix described in safe-seed.mjs.
 *
 * Decision matrix (from safe-seed.mjs):
 *
 *   DATABASE_URL host | --i-know-this-is-prod | ASSESSMENT_PROD_EXPECTED_HOST | Result
 *   ──────────────────┼───────────────────────┼───────────────────────────────┼────────────────────────────────────────
 *   Neon/prod         | absent                | any                           | BLOCKED — add flag
 *   Neon/prod         | present               | unset                         | ALLOWED (flag alone)
 *   Neon/prod         | present               | set, matches actual host      | ALLOWED
 *   Neon/prod         | present               | set, does NOT match           | BLOCKED — host mismatch
 *   dev host          | absent                | unset                         | ALLOWED (normal dev)
 *   dev host          | absent                | set, matches actual host      | BLOCKED — dev run on expected-prod host
 *   dev host          | absent                | set, does NOT match           | ALLOWED (dev .env elsewhere)
 *   dev host          | present               | any                           | ALLOWED (explicit override on dev)
 */

import { checkGuard, parseHost, looksLikeProd } from "../../lib/scripts/safe-seed-guard";

// ---------------------------------------------------------------------------
// parseHost()
// ---------------------------------------------------------------------------

describe("parseHost()", () => {
  it("extracts host from a standard postgresql URL", () => {
    expect(
      parseHost("postgresql://user:pass@my-neon-host.neon.tech:5432/dbname")
    ).toBe("my-neon-host.neon.tech");
  });

  it("extracts host when there is no port", () => {
    expect(
      parseHost("postgresql://user:pass@my-neon-host.neon.tech/dbname")
    ).toBe("my-neon-host.neon.tech");
  });

  it("returns empty string for empty/undefined URL", () => {
    expect(parseHost("")).toBe("");
    expect(parseHost(undefined)).toBe("");
  });

  it("handles URL without credentials (no @ sign)", () => {
    expect(parseHost("postgresql://localhost:5432/dbname")).toBe("localhost");
  });
});

// ---------------------------------------------------------------------------
// looksLikeProd()
// ---------------------------------------------------------------------------

describe("looksLikeProd()", () => {
  it("returns true for neon.tech URLs", () => {
    expect(looksLikeProd("postgresql://u:p@ep-abc.neon.tech/db")).toBe(true);
  });

  it("returns true for neon.dev URLs", () => {
    expect(looksLikeProd("postgresql://u:p@ep-abc.neon.dev/db")).toBe(true);
  });

  it("returns false for localhost", () => {
    expect(looksLikeProd("postgresql://u:p@localhost:5432/db")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(looksLikeProd(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkGuard() — prod host paths
// ---------------------------------------------------------------------------

const PROD_URL = "postgresql://user:pass@ep-prod.neon.tech:5432/mydb";
const PROD_HOST = "ep-prod.neon.tech";
const DIFFERENT_PROD_HOST = "ep-other.neon.tech";
const DEV_URL = "postgresql://user:pass@localhost:5432/devdb";
const DEV_HOST = "localhost";

describe("checkGuard() — prod host, no override flag", () => {
  it("BLOCKS when DATABASE_URL is prod and override is absent", () => {
    const result = checkGuard({
      url: PROD_URL,
      expectedHost: undefined,
      hasOverride: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Neon\/prod/);
  });

  it("BLOCKS even when ASSESSMENT_PROD_EXPECTED_HOST is set but override is absent", () => {
    const result = checkGuard({
      url: PROD_URL,
      expectedHost: PROD_HOST,
      hasOverride: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Neon\/prod/);
  });
});

describe("checkGuard() — prod host, override flag present", () => {
  it("ALLOWS when DATABASE_URL is prod, override present, no expectedHost", () => {
    const result = checkGuard({
      url: PROD_URL,
      expectedHost: undefined,
      hasOverride: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("ALLOWS when DATABASE_URL is prod, override present, expectedHost matches actual host", () => {
    const result = checkGuard({
      url: PROD_URL,
      expectedHost: PROD_HOST,
      hasOverride: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("BLOCKS when DATABASE_URL is prod, override present, but expectedHost does NOT match actual host", () => {
    const result = checkGuard({
      url: PROD_URL,
      expectedHost: DIFFERENT_PROD_HOST,
      hasOverride: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/fingerprint MISMATCH/i);
    expect(result.reason).toMatch(PROD_HOST);
    expect(result.reason).toMatch(DIFFERENT_PROD_HOST);
  });
});

// ---------------------------------------------------------------------------
// checkGuard() — dev host paths
// ---------------------------------------------------------------------------

describe("checkGuard() — dev host, no override flag", () => {
  it("ALLOWS dev host with no expectedHost (normal dev path)", () => {
    const result = checkGuard({
      url: DEV_URL,
      expectedHost: undefined,
      hasOverride: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("BLOCKS dev host when expectedHost matches actual host (dev .env points at prod)", () => {
    // DEV_URL host = "localhost"; if expectedHost is also "localhost", we block.
    const result = checkGuard({
      url: DEV_URL,
      expectedHost: DEV_HOST,
      hasOverride: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/dev dry-run/i);
    expect(result.reason).toMatch(DEV_HOST);
  });

  it("ALLOWS dev host when expectedHost does NOT match actual host (different environments)", () => {
    const result = checkGuard({
      url: DEV_URL,
      expectedHost: PROD_HOST,
      hasOverride: false,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("checkGuard() — dev host, override flag present", () => {
  it("ALLOWS dev host with override flag (explicit operator override)", () => {
    const result = checkGuard({
      url: DEV_URL,
      expectedHost: undefined,
      hasOverride: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("ALLOWS dev host with override flag even when expectedHost matches", () => {
    const result = checkGuard({
      url: DEV_URL,
      expectedHost: DEV_HOST,
      hasOverride: true,
    });
    expect(result.allowed).toBe(true);
  });
});
