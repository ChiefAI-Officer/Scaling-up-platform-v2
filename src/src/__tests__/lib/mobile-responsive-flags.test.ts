import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

const originalEnabled = process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
const originalKill = process.env.WAVE_MOBILE_RESPONSIVE_KILL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
  else process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = originalEnabled;
  if (originalKill === undefined) delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
  else process.env.WAVE_MOBILE_RESPONSIVE_KILL = originalKill;
});

describe("isMobileResponsiveEnabled", () => {
  it("is off by default", () => {
    delete process.env.WAVE_MOBILE_RESPONSIVE_ENABLED;
    delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
    expect(isMobileResponsiveEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("accepts %s as enabled", (value) => {
    process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = value;
    delete process.env.WAVE_MOBILE_RESPONSIVE_KILL;
    expect(isMobileResponsiveEnabled()).toBe(true);
  });

  it("lets the kill switch win", () => {
    process.env.WAVE_MOBILE_RESPONSIVE_ENABLED = "1";
    process.env.WAVE_MOBILE_RESPONSIVE_KILL = "1";
    expect(isMobileResponsiveEnabled()).toBe(false);
  });
});
