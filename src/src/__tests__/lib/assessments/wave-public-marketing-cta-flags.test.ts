import { isPublicMarketingCtaEnabled } from "@/lib/assessments/wave-public-marketing-cta-flags";

const ENABLED = "WAVE_PUBLIC_MARKETING_CTA_ENABLED";
const KILL = "WAVE_PUBLIC_MARKETING_CTA_KILL";

describe("isPublicMarketingCtaEnabled", () => {
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

  it("defaults off", () => {
    expect(isPublicMarketingCtaEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("enables for %s", (value) => {
    process.env[ENABLED] = value;
    expect(isPublicMarketingCtaEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "no", "on"])(
    "stays off for %j",
    (value) => {
      process.env[ENABLED] = value;
      expect(isPublicMarketingCtaEnabled()).toBe(false);
    },
  );

  it("lets the kill switch override enablement", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";
    expect(isPublicMarketingCtaEnabled()).toBe(false);
  });

  it("reads environment values at call time", () => {
    expect(isPublicMarketingCtaEnabled()).toBe(false);
    process.env[ENABLED] = "1";
    expect(isPublicMarketingCtaEnabled()).toBe(true);
    delete process.env[ENABLED];
    expect(isPublicMarketingCtaEnabled()).toBe(false);
  });
});
