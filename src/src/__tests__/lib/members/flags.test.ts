import {
  isMemberLedTeamsEnabled,
  isMemberPortalEnabled,
  isMemberReportGroupingEnabled,
} from "@/lib/members/flags";

const ENABLED = "WAVE_MP_MEMBER_PORTAL_ENABLED";
const KILL = "WAVE_MP_MEMBER_PORTAL_KILL";
const LED_TEAMS_ENABLED = "WAVE_MP_LED_TEAMS_ENABLED";
const LED_TEAMS_KILL = "WAVE_MP_LED_TEAMS_KILL";
const REPORT_GROUPING_ENABLED = "WAVE_MP_REPORT_GROUPING_ENABLED";
const REPORT_GROUPING_KILL = "WAVE_MP_REPORT_GROUPING_KILL";

const originalEnv = {
  enabled: process.env[ENABLED],
  kill: process.env[KILL],
  ledTeamsEnabled: process.env[LED_TEAMS_ENABLED],
  ledTeamsKill: process.env[LED_TEAMS_KILL],
  reportGroupingEnabled: process.env[REPORT_GROUPING_ENABLED],
  reportGroupingKill: process.env[REPORT_GROUPING_KILL],
};

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
  delete process.env[LED_TEAMS_ENABLED];
  delete process.env[LED_TEAMS_KILL];
  delete process.env[REPORT_GROUPING_ENABLED];
  delete process.env[REPORT_GROUPING_KILL];
});

afterAll(() => {
  if (originalEnv.enabled === undefined) delete process.env[ENABLED];
  else process.env[ENABLED] = originalEnv.enabled;

  if (originalEnv.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = originalEnv.kill;

  if (originalEnv.ledTeamsEnabled === undefined) delete process.env[LED_TEAMS_ENABLED];
  else process.env[LED_TEAMS_ENABLED] = originalEnv.ledTeamsEnabled;

  if (originalEnv.ledTeamsKill === undefined) delete process.env[LED_TEAMS_KILL];
  else process.env[LED_TEAMS_KILL] = originalEnv.ledTeamsKill;

  if (originalEnv.reportGroupingEnabled === undefined) {
    delete process.env[REPORT_GROUPING_ENABLED];
  } else process.env[REPORT_GROUPING_ENABLED] = originalEnv.reportGroupingEnabled;

  if (originalEnv.reportGroupingKill === undefined) {
    delete process.env[REPORT_GROUPING_KILL];
  } else process.env[REPORT_GROUPING_KILL] = originalEnv.reportGroupingKill;
});

describe("isMemberReportGroupingEnabled", () => {
  it("defaults off, reads at call time, and lets kill win", () => {
    expect(isMemberReportGroupingEnabled()).toBe(false);
    process.env[REPORT_GROUPING_ENABLED] = "1";
    expect(isMemberReportGroupingEnabled()).toBe(true);
    process.env[REPORT_GROUPING_KILL] = "true";
    expect(isMemberReportGroupingEnabled()).toBe(false);
  });
});

describe("isMemberLedTeamsEnabled", () => {
  it("defaults off, reads at call time, and lets kill win", () => {
    expect(isMemberLedTeamsEnabled()).toBe(false);
    process.env[LED_TEAMS_ENABLED] = "1";
    expect(isMemberLedTeamsEnabled()).toBe(true);
    process.env[LED_TEAMS_KILL] = "true";
    expect(isMemberLedTeamsEnabled()).toBe(false);
  });
});

describe("isMemberPortalEnabled", () => {
  it.each([undefined, "", "0", "false", "no", "off", "1 ", " 1"])(
    "defaults off for %p",
    (value) => {
      if (value !== undefined) process.env[ENABLED] = value;
      expect(isMemberPortalEnabled()).toBe(false);
    },
  );

  it.each(["1", "true", "TRUE", "yes"])("enables for %p", (value) => {
    process.env[ENABLED] = value;
    expect(isMemberPortalEnabled()).toBe(true);
  });

  it.each(["1", "true", "TRUE", "yes"])(
    "lets the kill switch override enablement for %p",
    (value) => {
      process.env[ENABLED] = "1";
      process.env[KILL] = value;
      expect(isMemberPortalEnabled()).toBe(false);
    },
  );

  it("reads both flags at call time", () => {
    expect(isMemberPortalEnabled()).toBe(false);
    process.env[ENABLED] = "true";
    expect(isMemberPortalEnabled()).toBe(true);
    process.env[KILL] = "yes";
    expect(isMemberPortalEnabled()).toBe(false);
  });
});
