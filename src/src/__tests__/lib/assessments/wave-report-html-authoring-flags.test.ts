import {
  isReportHtmlAuthoringEnabled,
  isReportHtmlExperienceEnabled,
} from "@/lib/assessments/wave-report-html-authoring-flags";

const REPORT_ENABLED = "WAVE_REPORT_HTML_AUTHORING_ENABLED";
const REPORT_KILL = "WAVE_REPORT_HTML_AUTHORING_KILL";
const ED10_ENABLED = "WAVE_ED10_PREVIEW_SETTINGS_ENABLED";
const ED10_KILL = "WAVE_ED10_PREVIEW_SETTINGS_KILL";
const KEYS = [REPORT_ENABLED, REPORT_KILL, ED10_ENABLED, ED10_KILL] as const;

describe("report HTML authoring flags", () => {
  const saved: Partial<Record<(typeof KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      const value = process.env[key];
      if (value === undefined) delete saved[key];
      else saved[key] = value;
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults off and lets the report kill switch win", () => {
    expect(isReportHtmlAuthoringEnabled()).toBe(false);

    process.env[REPORT_ENABLED] = "1";
    expect(isReportHtmlAuthoringEnabled()).toBe(true);

    process.env[REPORT_KILL] = "1";
    expect(isReportHtmlAuthoringEnabled()).toBe(false);
  });

  it("requires the effective ED10 experience", () => {
    process.env[REPORT_ENABLED] = "1";
    expect(isReportHtmlExperienceEnabled()).toBe(false);

    process.env[ED10_ENABLED] = "1";
    expect(isReportHtmlExperienceEnabled()).toBe(true);

    process.env[ED10_KILL] = "1";
    expect(isReportHtmlExperienceEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])(
    "accepts the established truthy value %s at call time",
    (value) => {
      process.env[REPORT_ENABLED] = value;
      expect(isReportHtmlAuthoringEnabled()).toBe(true);
      delete process.env[REPORT_ENABLED];
      expect(isReportHtmlAuthoringEnabled()).toBe(false);
    },
  );
});
