import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";

const ENABLED = "WAVE_REPORT_STYLES_ENABLED";
const CANARY = "WAVE_REPORT_STYLES_CANARY";
const KILL = "WAVE_REPORT_STYLES_KILL";

const original = {
  enabled: process.env[ENABLED],
  canary: process.env[CANARY],
  kill: process.env[KILL],
};

function clearFlags() {
  delete process.env[ENABLED];
  delete process.env[CANARY];
  delete process.env[KILL];
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
