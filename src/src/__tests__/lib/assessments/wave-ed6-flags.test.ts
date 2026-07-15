import { isSingleColumnEnabled } from "@/lib/assessments/wave-ed6-flags";

describe("isSingleColumnEnabled", () => {
  const prev = process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED;
    else process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED = prev;
  });

  it("is false by default (unset)", () => {
    delete process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED;
    expect(isSingleColumnEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("is true for %s", (v) => {
    process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED = v;
    expect(isSingleColumnEnabled()).toBe(true);
  });

  it.each(["0", "false", "off", "", "No"])("is false for %s", (v) => {
    process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED = v;
    expect(isSingleColumnEnabled()).toBe(false);
  });
});
