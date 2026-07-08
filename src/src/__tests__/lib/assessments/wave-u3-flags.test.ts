/**
 * Wave U3 (spec 19aa D2) — results-email findings flag.
 *
 * A SEPARATE default-OFF flag from the live Wave U flag: findings ship dark in
 * the results email until a launch-walk flips it. Single ENABLED lever, strict
 * truthiness, call-time env reads (no caching).
 */
import { isEmailFindingsEnabled } from "@/lib/assessments/wave-u3-flags";

const ENABLED = "WAVE_U3_EMAIL_FINDINGS_ENABLED";

describe("isEmailFindingsEnabled", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENABLED];
    delete process.env[ENABLED];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[ENABLED];
    else process.env[ENABLED] = saved;
  });

  it("defaults OFF when nothing is set", () => {
    expect(isEmailFindingsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("ENABLED=%s turns it on", (v) => {
    process.env[ENABLED] = v;
    expect(isEmailFindingsEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on", "True", "YES "])(
    "ENABLED=%j stays off (strict truthiness)",
    (v) => {
      process.env[ENABLED] = v;
      expect(isEmailFindingsEnabled()).toBe(false);
    },
  );

  it("reads env at call time (no caching)", () => {
    expect(isEmailFindingsEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isEmailFindingsEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isEmailFindingsEnabled()).toBe(false);
  });
});
