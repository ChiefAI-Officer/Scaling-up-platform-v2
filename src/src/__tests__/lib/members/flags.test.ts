import { isMemberPortalEnabled } from "@/lib/members/flags";

const ENABLED = "WAVE_MP_MEMBER_PORTAL_ENABLED";
const KILL = "WAVE_MP_MEMBER_PORTAL_KILL";

const originalEnv = {
  enabled: process.env[ENABLED],
  kill: process.env[KILL],
};

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
});

afterAll(() => {
  if (originalEnv.enabled === undefined) delete process.env[ENABLED];
  else process.env[ENABLED] = originalEnv.enabled;

  if (originalEnv.kill === undefined) delete process.env[KILL];
  else process.env[KILL] = originalEnv.kill;
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
