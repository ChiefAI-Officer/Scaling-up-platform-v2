/**
 * Wave M custom-slides feature flag — TDD test suite.
 *
 * Mirrors the Wave-F / Wave-D flag truthiness convention
 * (`@/lib/assessments/wave-f-flags`):
 *   - Default-OFF (false) when unset / "" / "0" / "false"
 *   - ON (true) only for "1" / "true" / "TRUE" / "yes"
 *
 * `isCustomSlidesEnabled()` gates the per-campaign custom-slides launch behind
 * three independent levers: a default-OFF global flag, a campaign-id-only
 * canary allowlist, and a hard kill-switch that overrides both.
 */

import { isCustomSlidesEnabled } from "@/lib/assessments/wave-m-flags";

const GLOBAL = "WAVE_M_CUSTOM_SLIDES_ENABLED";
const CANARY = "WAVE_M_CUSTOM_SLIDES_CANARY";
const KILL = "WAVE_M_CUSTOM_SLIDES_KILL";

// Save/restore so tests never leak env state into the rest of the suite.
const ORIGINAL_ENV = {
  global: process.env[GLOBAL],
  canary: process.env[CANARY],
  kill: process.env[KILL],
};

afterEach(() => {
  delete process.env[GLOBAL];
  delete process.env[CANARY];
  delete process.env[KILL];
});

afterAll(() => {
  if (ORIGINAL_ENV.global === undefined) delete process.env[GLOBAL];
  else process.env[GLOBAL] = ORIGINAL_ENV.global;
  if (ORIGINAL_ENV.canary === undefined) delete process.env[CANARY];
  else process.env[CANARY] = ORIGINAL_ENV.canary;
  if (ORIGINAL_ENV.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = ORIGINAL_ENV.kill;
});

// ─── default OFF ──────────────────────────────────────────────────────────

describe("default OFF", () => {
  it("returns false when no env vars are set", () => {
    expect(isCustomSlidesEnabled("camp-1")).toBe(false);
  });

  it("returns false with no env and no campaignId", () => {
    expect(isCustomSlidesEnabled()).toBe(false);
    expect(isCustomSlidesEnabled(undefined)).toBe(false);
  });

  it.each([undefined, "", "0", "false", "FALSE", "no"])(
    "returns false when global flag is %p (no canary)",
    (value) => {
      if (value === undefined) delete process.env[GLOBAL];
      else process.env[GLOBAL] = value;
      expect(isCustomSlidesEnabled("camp-1")).toBe(false);
    }
  );
});

// ─── global flag ON ─────────────────────────────────────────────────────────

describe("global flag ON", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "returns true for any campaign when global flag is %p",
    (value) => {
      process.env[GLOBAL] = value;
      expect(isCustomSlidesEnabled("camp-x")).toBe(true);
      expect(isCustomSlidesEnabled("any-other-campaign")).toBe(true);
    }
  );

  it("returns true with global ON even when campaignId is undefined", () => {
    process.env[GLOBAL] = "1";
    expect(isCustomSlidesEnabled()).toBe(true);
  });
});

// ─── canary allowlist (global OFF) ────────────────────────────────────────────

describe("canary allowlist while global flag OFF", () => {
  it("matches a listed campaign id", () => {
    process.env[CANARY] = "camp-allowed,camp-other";
    expect(isCustomSlidesEnabled("camp-allowed")).toBe(true);
  });

  it("matches only that id — a non-listed campaign stays false", () => {
    process.env[CANARY] = "camp-allowed";
    expect(isCustomSlidesEnabled("camp-allowed")).toBe(true);
    expect(isCustomSlidesEnabled("camp-denied")).toBe(false);
  });

  it("tolerates whitespace and comma padding in the allowlist", () => {
    process.env[CANARY] = "  camp-a , camp-b ,  camp-c  ";
    expect(isCustomSlidesEnabled("camp-a")).toBe(true);
    expect(isCustomSlidesEnabled("camp-b")).toBe(true);
    expect(isCustomSlidesEnabled("camp-c")).toBe(true);
  });

  it("ignores empty allowlist entries", () => {
    process.env[CANARY] = ",,  ,";
    expect(isCustomSlidesEnabled("")).toBe(false);
    expect(isCustomSlidesEnabled("camp-1")).toBe(false);
  });

  it("returns false on empty canary string", () => {
    process.env[CANARY] = "";
    expect(isCustomSlidesEnabled("camp-1")).toBe(false);
  });

  it("returns false when canary is set but campaignId is undefined", () => {
    process.env[CANARY] = "camp-allowed";
    expect(isCustomSlidesEnabled()).toBe(false);
    expect(isCustomSlidesEnabled(undefined)).toBe(false);
  });
});

// ─── kill precedence ──────────────────────────────────────────────────────────

describe("kill switch precedence", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "KILL=%p overrides a global enable",
    (value) => {
      process.env[GLOBAL] = "1";
      process.env[KILL] = value;
      expect(isCustomSlidesEnabled("camp-1")).toBe(false);
    }
  );

  it("KILL=1 overrides a matching canary", () => {
    process.env[CANARY] = "camp-allowed";
    process.env[KILL] = "1";
    expect(isCustomSlidesEnabled("camp-allowed")).toBe(false);
  });

  it("KILL=1 overrides BOTH a global enable and a matching canary", () => {
    process.env[GLOBAL] = "1";
    process.env[CANARY] = "camp-allowed";
    process.env[KILL] = "1";
    expect(isCustomSlidesEnabled("camp-allowed")).toBe(false);
    expect(isCustomSlidesEnabled("camp-other")).toBe(false);
  });

  it.each([undefined, "", "0", "false", "no"])(
    "a falsy KILL value (%p) does not disable an otherwise-enabled flag",
    (value) => {
      process.env[GLOBAL] = "1";
      if (value === undefined) delete process.env[KILL];
      else process.env[KILL] = value;
      expect(isCustomSlidesEnabled("camp-1")).toBe(true);
    }
  );
});

// ─── reads env at call time ───────────────────────────────────────────────────

describe("env read at call time", () => {
  it("reflects a flag flip between calls", () => {
    expect(isCustomSlidesEnabled("camp-1")).toBe(false);
    process.env[GLOBAL] = "1";
    expect(isCustomSlidesEnabled("camp-1")).toBe(true);
    process.env[GLOBAL] = "0";
    expect(isCustomSlidesEnabled("camp-1")).toBe(false);
  });
});
