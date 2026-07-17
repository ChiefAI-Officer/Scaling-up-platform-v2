/**
 * Wave ED9 — Forms Build-tab flag (spec 19al-plan Task 1).
 *
 * KILL > ENABLED, call-time env reads, default OFF. The flag gates the
 * ED9 Google-Forms Build-tab PRESENTATION only (no schema/API/data) —
 * kill/off means the Build tab is byte-identical to today's ED6
 * SingleColumnFormBuilder.
 */
import { isFormsBuildEnabled } from "@/lib/assessments/wave-ed9-flags";

const ENABLED = "WAVE_ED9_FORMS_BUILD_ENABLED";
const KILL = "WAVE_ED9_FORMS_BUILD_KILL";

describe("isFormsBuildEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [ENABLED, KILL]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of [ENABLED, KILL]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults OFF when nothing is set", () => {
    expect(isFormsBuildEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (v) => {
    process.env[ENABLED] = v;
    expect(isFormsBuildEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays OFF for non-truthy value %j",
    (v) => {
      process.env[ENABLED] = v;
      expect(isFormsBuildEnabled()).toBe(false);
    },
  );

  it("KILL overrides a global enable", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isFormsBuildEnabled()).toBe(false);
  });

  it("KILL alone keeps it off (no double-negative)", () => {
    process.env[KILL] = "1";
    expect(isFormsBuildEnabled()).toBe(false);
  });

  it("reads env at call time (flip without module reload)", () => {
    expect(isFormsBuildEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isFormsBuildEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isFormsBuildEnabled()).toBe(false);
  });
});
