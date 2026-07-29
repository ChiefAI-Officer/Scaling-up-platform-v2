/**
 * Wave OSR on-screen respondent results feature flag — TDD test suite.
 *
 * Mirrors the Wave-M / Wave-W flag truthiness convention:
 *   - Default-OFF (false) when unset / "" / "0" / "false"
 *   - ON (true) only for "1" / "true" / "TRUE" / "yes"
 *
 * Two levers only — NO canary. The surface is respondent-facing, so a
 * per-campaign canary would expose the feature to real end users on a guess
 * (spec 19an).
 */

import { isOnScreenResultsEnabled } from "@/lib/assessments/wave-osr-flags";

const GLOBAL = "WAVE_OSR_RESPONDENT_RESULTS_ENABLED";
const KILL = "WAVE_OSR_RESPONDENT_RESULTS_KILL";

// Save/restore so tests never leak env state into the rest of the suite.
const ORIGINAL_ENV = {
  global: process.env[GLOBAL],
  kill: process.env[KILL],
};

afterEach(() => {
  delete process.env[GLOBAL];
  delete process.env[KILL];
});

afterAll(() => {
  if (ORIGINAL_ENV.global === undefined) delete process.env[GLOBAL];
  else process.env[GLOBAL] = ORIGINAL_ENV.global;
  if (ORIGINAL_ENV.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = ORIGINAL_ENV.kill;
});

describe("default OFF", () => {
  it("returns false when no env vars are set", () => {
    expect(isOnScreenResultsEnabled()).toBe(false);
  });

  it.each(["", "0", "false", "no", "off", "1 ", " 1"])(
    "returns false for the non-truthy value %p",
    (value) => {
      process.env[GLOBAL] = value;
      expect(isOnScreenResultsEnabled()).toBe(false);
    },
  );
});

describe("global enable", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "returns true for the truthy value %p",
    (value) => {
      process.env[GLOBAL] = value;
      expect(isOnScreenResultsEnabled()).toBe(true);
    },
  );
});

describe("kill switch hard-overrides", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "returns false when KILL is %p even with the global flag on",
    (value) => {
      process.env[GLOBAL] = "1";
      process.env[KILL] = value;
      expect(isOnScreenResultsEnabled()).toBe(false);
    },
  );

  it("a non-truthy KILL does not suppress an enabled flag", () => {
    process.env[GLOBAL] = "1";
    process.env[KILL] = "0";
    expect(isOnScreenResultsEnabled()).toBe(true);
  });
});

describe("purity", () => {
  it("reads env at call time, so a mid-process flip is observed", () => {
    expect(isOnScreenResultsEnabled()).toBe(false);
    process.env[GLOBAL] = "1";
    expect(isOnScreenResultsEnabled()).toBe(true);
    process.env[KILL] = "1";
    expect(isOnScreenResultsEnabled()).toBe(false);
  });

  it("never throws when env values are absent", () => {
    expect(() => isOnScreenResultsEnabled()).not.toThrow();
  });
});
