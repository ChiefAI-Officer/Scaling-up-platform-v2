import {
  isReportStyleSelectionEnabled,
  isReportStylesEnabled,
} from "@/lib/assessments/wave-report-styles-flags";

const ENABLED = "WAVE_REPORT_STYLES_ENABLED";
const CANARY = "WAVE_REPORT_STYLES_CANARY";
const KILL = "WAVE_REPORT_STYLES_KILL";
const REPORT_HTML_ENABLED = "WAVE_REPORT_HTML_AUTHORING_ENABLED";
const REPORT_HTML_KILL = "WAVE_REPORT_HTML_AUTHORING_KILL";
const ED10_ENABLED = "WAVE_ED10_PREVIEW_SETTINGS_ENABLED";
const ED10_KILL = "WAVE_ED10_PREVIEW_SETTINGS_KILL";

const original = {
  enabled: process.env[ENABLED],
  canary: process.env[CANARY],
  kill: process.env[KILL],
  reportHtmlEnabled: process.env[REPORT_HTML_ENABLED],
  reportHtmlKill: process.env[REPORT_HTML_KILL],
  ed10Enabled: process.env[ED10_ENABLED],
  ed10Kill: process.env[ED10_KILL],
};

function clearFlags() {
  delete process.env[ENABLED];
  delete process.env[CANARY];
  delete process.env[KILL];
  delete process.env[REPORT_HTML_ENABLED];
  delete process.env[REPORT_HTML_KILL];
  delete process.env[ED10_ENABLED];
  delete process.env[ED10_KILL];
}

beforeEach(clearFlags);
afterEach(clearFlags);

afterAll(() => {
  if (original.enabled === undefined) delete process.env[ENABLED];
  else process.env[ENABLED] = original.enabled;
  if (original.canary === undefined) delete process.env[CANARY];
  else process.env[CANARY] = original.canary;
  if (original.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = original.kill;
  if (original.reportHtmlEnabled === undefined) delete process.env[REPORT_HTML_ENABLED];
  else process.env[REPORT_HTML_ENABLED] = original.reportHtmlEnabled;
  if (original.reportHtmlKill === undefined) delete process.env[REPORT_HTML_KILL];
  else process.env[REPORT_HTML_KILL] = original.reportHtmlKill;
  if (original.ed10Enabled === undefined) delete process.env[ED10_ENABLED];
  else process.env[ED10_ENABLED] = original.ed10Enabled;
  if (original.ed10Kill === undefined) delete process.env[ED10_KILL];
  else process.env[ED10_KILL] = original.ed10Kill;
});

describe("isReportStylesEnabled", () => {
  it("is off by default", () => {
    expect(isReportStylesEnabled()).toBe(false);
    expect(isReportStylesEnabled({ templateId: "template-1" })).toBe(false);
  });

  it("enables report styles globally", () => {
    process.env[ENABLED] = "1";

    expect(isReportStylesEnabled()).toBe(true);
    expect(isReportStylesEnabled({ campaignId: "campaign-1" })).toBe(true);
  });

  it("enables a template or campaign only when its exact id is canaried", () => {
    process.env[CANARY] = " template-1, campaign-1 ,, template-10 ";

    expect(isReportStylesEnabled({ templateId: "template-1" })).toBe(true);
    expect(isReportStylesEnabled({ campaignId: "campaign-1" })).toBe(true);
    expect(isReportStylesEnabled({ templateId: "template-10" })).toBe(true);
    expect(isReportStylesEnabled({ templateId: "template" })).toBe(false);
    expect(isReportStylesEnabled({ campaignId: "campaign-10" })).toBe(false);
    expect(isReportStylesEnabled({ templateId: "" })).toBe(false);
  });

  it("lets the kill switch override both global and canary enablement", () => {
    process.env[ENABLED] = "1";
    process.env[CANARY] = "campaign-1";
    process.env[KILL] = "true";

    expect(isReportStylesEnabled()).toBe(false);
    expect(isReportStylesEnabled({ campaignId: "campaign-1" })).toBe(false);
  });
});

describe("isReportStyleSelectionEnabled", () => {
  it("retires new style selection during the successor HTML experience without disabling historical rendering", () => {
    process.env[ENABLED] = "1";
    process.env[REPORT_HTML_ENABLED] = "1";
    process.env[ED10_ENABLED] = "1";

    expect(isReportStyleSelectionEnabled({ templateId: "template-1" })).toBe(false);
    expect(isReportStylesEnabled({ templateId: "template-1" })).toBe(true);
  });

  it("preserves legacy style selection when the successor experience is inactive", () => {
    process.env[ENABLED] = "1";

    expect(isReportStyleSelectionEnabled({ templateId: "template-1" })).toBe(true);
  });
});
