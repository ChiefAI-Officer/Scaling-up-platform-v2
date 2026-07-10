import { isTestModeEnabled } from "@/lib/assessments/wave-ed1-flags";

describe("wave-ed1-flags", () => {
  const prev = process.env.WAVE_ED1_TEST_MODE_ENABLED;
  afterEach(() => { process.env.WAVE_ED1_TEST_MODE_ENABLED = prev; });

  it("is OFF when unset", () => {
    delete process.env.WAVE_ED1_TEST_MODE_ENABLED;
    expect(isTestModeEnabled()).toBe(false);
  });
  it.each(["", "0", "false"])("is OFF for %p", (v) => {
    process.env.WAVE_ED1_TEST_MODE_ENABLED = v;
    expect(isTestModeEnabled()).toBe(false);
  });
  it.each(["1", "true", "TRUE", "yes"])("is ON for %p", (v) => {
    process.env.WAVE_ED1_TEST_MODE_ENABLED = v;
    expect(isTestModeEnabled()).toBe(true);
  });
});
