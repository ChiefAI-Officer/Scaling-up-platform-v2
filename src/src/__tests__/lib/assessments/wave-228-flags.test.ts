import { reportEmailChromeForCampaign } from "@/lib/assessments/wave-228-flags";

const ENABLED = "WAVE_228_REPORT_EMAIL_CHROME_ENABLED";
const CANARY = "WAVE_228_REPORT_EMAIL_CHROME_CANARY";
const KILL = "WAVE_228_REPORT_EMAIL_CHROME_KILL";
const original = {
  enabled: process.env[ENABLED],
  canary: process.env[CANARY],
  kill: process.env[KILL],
};

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[CANARY];
  delete process.env[KILL];
});

afterAll(() => {
  for (const [key, value] of [
    [ENABLED, original.enabled],
    [CANARY, original.canary],
    [KILL, original.kill],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("defaults to legacy", () => {
  expect(reportEmailChromeForCampaign("camp-1")).toBe("legacy");
});

it.each(["1", "true", "TRUE", "yes"])("enables globally for %s", (value) => {
  process.env[ENABLED] = value;
  expect(reportEmailChromeForCampaign("camp-1")).toBe("gh228");
});

it("keeps global chrome disabled for false", () => {
  process.env[ENABLED] = "false";
  expect(reportEmailChromeForCampaign("camp-1")).toBe("legacy");
});

it("matches exact comma-or-whitespace-delimited campaign IDs", () => {
  process.env[CANARY] = "camp-a, camp-b\ncamp-c";
  expect(reportEmailChromeForCampaign("camp-b")).toBe("gh228");
  expect(reportEmailChromeForCampaign("camp")).toBe("legacy");
  expect(reportEmailChromeForCampaign()).toBe("legacy");
});

it("gives kill precedence over global and canary", () => {
  process.env[ENABLED] = "1";
  process.env[CANARY] = "camp-1";
  process.env[KILL] = "yes";
  expect(reportEmailChromeForCampaign("camp-1")).toBe("legacy");
});

it("does not treat a false kill switch as enabled", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "false";
  expect(reportEmailChromeForCampaign("camp-1")).toBe("gh228");
});
