import { isReportHtmlLimitsEnabled } from "@/lib/assessments/wave-report-html-limits-flags";

const ENABLED = "WAVE_REPORT_HTML_LIMITS_ENABLED";
const KILL = "WAVE_REPORT_HTML_LIMITS_KILL";

describe("report HTML limits flags", () => {
  const savedEnabled = process.env[ENABLED];
  const savedKill = process.env[KILL];

  beforeEach(() => {
    delete process.env[ENABLED];
    delete process.env[KILL];
  });

  afterAll(() => {
    if (savedEnabled === undefined) delete process.env[ENABLED];
    else process.env[ENABLED] = savedEnabled;
    if (savedKill === undefined) delete process.env[KILL];
    else process.env[KILL] = savedKill;
  });

  it("defaults off and lets the kill switch win", () => {
    expect(isReportHtmlLimitsEnabled()).toBe(false);

    process.env[ENABLED] = "1";
    expect(isReportHtmlLimitsEnabled()).toBe(true);

    process.env[KILL] = "1";
    expect(isReportHtmlLimitsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])(
    "accepts the established truthy value %s at call time",
    (value) => {
      process.env[ENABLED] = value;
      expect(isReportHtmlLimitsEnabled()).toBe(true);
      delete process.env[ENABLED];
      expect(isReportHtmlLimitsEnabled()).toBe(false);
    },
  );
});
