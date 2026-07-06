/**
 * Wave U — findings-logic flag (spec 19u U-1).
 *
 * KILL > ENABLED, call-time env reads, default OFF, no canary lever
 * (authoring is admin/STAFF-only; rendering is inert until rules exist).
 */
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";

const ENABLED = "WAVE_U_FINDINGS_ENABLED";
const KILL = "WAVE_U_FINDINGS_KILL";

describe("isFindingsLogicEnabled", () => {
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
    expect(isFindingsLogicEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("ENABLED=%s turns it on", (v) => {
    process.env[ENABLED] = v;
    expect(isFindingsLogicEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on", "True", "YES "])(
    "ENABLED=%j stays off (strict truthiness)",
    (v) => {
      process.env[ENABLED] = v;
      expect(isFindingsLogicEnabled()).toBe(false);
    }
  );

  it.each(["1", "true", "TRUE", "yes"])(
    "KILL=%s overrides ENABLED=1",
    (v) => {
      process.env[ENABLED] = "1";
      process.env[KILL] = v;
      expect(isFindingsLogicEnabled()).toBe(false);
    }
  );

  it("non-truthy KILL does not disable an enabled flag", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "0";
    expect(isFindingsLogicEnabled()).toBe(true);
  });

  it("reads env at call time (no caching)", () => {
    expect(isFindingsLogicEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isFindingsLogicEnabled()).toBe(true);
    process.env[KILL] = "1";
    expect(isFindingsLogicEnabled()).toBe(false);
    delete process.env[KILL];
    expect(isFindingsLogicEnabled()).toBe(true);
  });
});
