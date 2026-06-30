/**
 * Wave N per-respondent longitudinal feature flag — TDD test suite.
 *
 * Mirrors the Wave-M / Wave-F flag truthiness convention
 * (`@/lib/assessments/wave-m-flags`, `@/lib/assessments/wave-f-flags`):
 *   - Default-OFF (false) when unset / "" / "0" / "false"
 *   - ON (true) only for "1" / "true" / "TRUE" / "yes"
 *
 * `isRespondentLongitudinalEnabled()` gates the per-respondent longitudinal
 * comparison launch behind three independent levers: a default-OFF global flag,
 * an org/template-id canary allowlist, and a hard kill-switch that overrides
 * both. The canary is org-OR-template-scoped (per the 18mn plan, item 2).
 */

import { isRespondentLongitudinalEnabled } from "@/lib/assessments/wave-n-flags";

const GLOBAL = "WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED";
const CANARY = "WAVE_N_RESPONDENT_LONGITUDINAL_CANARY";
const KILL = "WAVE_N_RESPONDENT_LONGITUDINAL_KILL";

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
  it("returns false when no env vars are set (with ids)", () => {
    expect(
      isRespondentLongitudinalEnabled({ organizationId: "org-1", templateId: "tpl-1" })
    ).toBe(false);
  });

  it("returns false with no env and no opts", () => {
    expect(isRespondentLongitudinalEnabled()).toBe(false);
    expect(isRespondentLongitudinalEnabled(undefined)).toBe(false);
    expect(isRespondentLongitudinalEnabled({})).toBe(false);
  });

  it.each([undefined, "", "0", "false", "FALSE", "no"])(
    "returns false when global flag is %p (no canary)",
    (value) => {
      if (value === undefined) delete process.env[GLOBAL];
      else process.env[GLOBAL] = value;
      expect(
        isRespondentLongitudinalEnabled({ organizationId: "org-1", templateId: "tpl-1" })
      ).toBe(false);
    }
  );
});

// ─── global flag ON ─────────────────────────────────────────────────────────

describe("global flag ON", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "returns true for any ids when global flag is %p",
    (value) => {
      process.env[GLOBAL] = value;
      expect(
        isRespondentLongitudinalEnabled({ organizationId: "org-x", templateId: "tpl-x" })
      ).toBe(true);
      expect(
        isRespondentLongitudinalEnabled({ organizationId: "other-org", templateId: "other-tpl" })
      ).toBe(true);
    }
  );

  it("returns true with global ON even when opts are undefined/empty", () => {
    process.env[GLOBAL] = "1";
    expect(isRespondentLongitudinalEnabled()).toBe(true);
    expect(isRespondentLongitudinalEnabled({})).toBe(true);
  });
});

// ─── canary allowlist (global OFF) — org id ────────────────────────────────

describe("canary allowlist while global flag OFF — organization id", () => {
  it("matches a listed organization id", () => {
    process.env[CANARY] = "org-allowed,org-other";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-allowed" })).toBe(true);
  });

  it("matches only that org — a non-listed org stays false", () => {
    process.env[CANARY] = "org-allowed";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-allowed" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-denied" })).toBe(false);
  });
});

// ─── canary allowlist (global OFF) — template id ───────────────────────────

describe("canary allowlist while global flag OFF — template id", () => {
  it("matches a listed template id", () => {
    process.env[CANARY] = "tpl-allowed,tpl-other";
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-allowed" })).toBe(true);
  });

  it("matches only that template — a non-listed template stays false", () => {
    process.env[CANARY] = "tpl-allowed";
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-allowed" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-denied" })).toBe(false);
  });

  it("matches when EITHER the org id OR the template id is listed", () => {
    process.env[CANARY] = "tpl-allowed";
    // org not listed, template listed → true
    expect(
      isRespondentLongitudinalEnabled({ organizationId: "org-denied", templateId: "tpl-allowed" })
    ).toBe(true);
    process.env[CANARY] = "org-allowed";
    // org listed, template not listed → true
    expect(
      isRespondentLongitudinalEnabled({ organizationId: "org-allowed", templateId: "tpl-denied" })
    ).toBe(true);
    // neither listed → false
    process.env[CANARY] = "something-else";
    expect(
      isRespondentLongitudinalEnabled({ organizationId: "org-denied", templateId: "tpl-denied" })
    ).toBe(false);
  });
});

// ─── canary parsing (whitespace / commas / empties) ────────────────────────

describe("canary allowlist parsing", () => {
  it("tolerates whitespace and comma padding in the allowlist", () => {
    process.env[CANARY] = "  org-a , tpl-b ,  org-c  ";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-a" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-b" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-c" })).toBe(true);
  });

  it("tolerates space-separated ids (no commas)", () => {
    process.env[CANARY] = "org-a tpl-b org-c";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-a" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-b" })).toBe(true);
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-c" })).toBe(true);
  });

  it("ignores empty allowlist entries", () => {
    process.env[CANARY] = ",,  ,";
    expect(isRespondentLongitudinalEnabled({ organizationId: "" })).toBe(false);
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-1" })).toBe(false);
  });

  it("returns false on empty canary string", () => {
    process.env[CANARY] = "";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-1", templateId: "tpl-1" })).toBe(false);
  });

  it("returns false when canary is set but opts are undefined/empty", () => {
    process.env[CANARY] = "org-allowed,tpl-allowed";
    expect(isRespondentLongitudinalEnabled()).toBe(false);
    expect(isRespondentLongitudinalEnabled(undefined)).toBe(false);
    expect(isRespondentLongitudinalEnabled({})).toBe(false);
  });

  it("does not match an empty-string id against an empty-filtered allowlist", () => {
    process.env[CANARY] = "org-allowed";
    expect(isRespondentLongitudinalEnabled({ organizationId: "", templateId: "" })).toBe(false);
  });
});

// ─── kill precedence ──────────────────────────────────────────────────────────

describe("kill switch precedence", () => {
  it.each(["1", "true", "TRUE", "yes"])(
    "KILL=%p overrides a global enable",
    (value) => {
      process.env[GLOBAL] = "1";
      process.env[KILL] = value;
      expect(
        isRespondentLongitudinalEnabled({ organizationId: "org-1", templateId: "tpl-1" })
      ).toBe(false);
    }
  );

  it("KILL=1 overrides a matching org canary", () => {
    process.env[CANARY] = "org-allowed";
    process.env[KILL] = "1";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-allowed" })).toBe(false);
  });

  it("KILL=1 overrides a matching template canary", () => {
    process.env[CANARY] = "tpl-allowed";
    process.env[KILL] = "1";
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-allowed" })).toBe(false);
  });

  it("KILL=1 overrides BOTH a global enable and a matching canary", () => {
    process.env[GLOBAL] = "1";
    process.env[CANARY] = "org-allowed,tpl-allowed";
    process.env[KILL] = "1";
    expect(isRespondentLongitudinalEnabled({ organizationId: "org-allowed" })).toBe(false);
    expect(isRespondentLongitudinalEnabled({ templateId: "tpl-allowed" })).toBe(false);
    expect(
      isRespondentLongitudinalEnabled({ organizationId: "org-other", templateId: "tpl-other" })
    ).toBe(false);
  });

  it.each([undefined, "", "0", "false", "no"])(
    "a falsy KILL value (%p) does not disable an otherwise-enabled flag",
    (value) => {
      process.env[GLOBAL] = "1";
      if (value === undefined) delete process.env[KILL];
      else process.env[KILL] = value;
      expect(
        isRespondentLongitudinalEnabled({ organizationId: "org-1", templateId: "tpl-1" })
      ).toBe(true);
    }
  );
});

// ─── reads env at call time ───────────────────────────────────────────────────

describe("env read at call time", () => {
  it("reflects a flag flip between calls", () => {
    const opts = { organizationId: "org-1", templateId: "tpl-1" };
    expect(isRespondentLongitudinalEnabled(opts)).toBe(false);
    process.env[GLOBAL] = "1";
    expect(isRespondentLongitudinalEnabled(opts)).toBe(true);
    process.env[GLOBAL] = "0";
    expect(isRespondentLongitudinalEnabled(opts)).toBe(false);
  });
});
