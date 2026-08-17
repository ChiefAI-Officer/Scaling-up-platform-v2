import { isSuFullLandscapeReportEnabled } from "@/lib/assessments/wave-su-full-landscape-flags";

const ENABLED = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const KILL = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";

describe("isSuFullLandscapeReportEnabled", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [ENABLED, KILL]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of [ENABLED, KILL]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults OFF for client-safe env keys", () => {
    expect(isSuFullLandscapeReportEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables for truthy value %s", (value) => {
    process.env[ENABLED] = value;
    expect(isSuFullLandscapeReportEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])("stays OFF for non-truthy value %j", (value) => {
    process.env[ENABLED] = value;
    expect(isSuFullLandscapeReportEnabled()).toBe(false);
  });

  it("lets KILL override an enabled landscape release", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isSuFullLandscapeReportEnabled()).toBe(false);
  });

  it("reads the release state at call time", () => {
    expect(isSuFullLandscapeReportEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isSuFullLandscapeReportEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isSuFullLandscapeReportEnabled()).toBe(false);
  });
});
