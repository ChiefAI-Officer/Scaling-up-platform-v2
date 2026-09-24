import { timezonePickerEnabled } from "@/lib/time/wave-timezone-flags";

const ORIGINAL_ENV = process.env;

describe("timezone feature flag", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("stays dark by default and enables explicitly", () => {
    delete process.env.WAVE_TZ_ZONE_PICKER_ENABLED;
    expect(timezonePickerEnabled()).toBe(false);

    process.env.WAVE_TZ_ZONE_PICKER_ENABLED = "1";
    expect(timezonePickerEnabled()).toBe(true);
  });

  it("lets the kill switch override enablement", () => {
    process.env.WAVE_TZ_ZONE_PICKER_ENABLED = "1";
    process.env.WAVE_TZ_ZONE_PICKER_KILL = "1";
    expect(timezonePickerEnabled()).toBe(false);
  });
});
