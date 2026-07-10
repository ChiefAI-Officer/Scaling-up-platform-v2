import { isSafeToPublishEnabled } from "@/lib/assessments/wave-ed2-flags";

describe("isSafeToPublishEnabled", () => {
  const prev = process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED;
    else process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = prev;
  });

  it("is false by default (unset)", () => {
    delete process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED;
    expect(isSafeToPublishEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])("is true for %s", (v) => {
    process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = v;
    expect(isSafeToPublishEnabled()).toBe(true);
  });

  it.each(["0", "false", "off", "", "No"])("is false for %s", (v) => {
    process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED = v;
    expect(isSafeToPublishEnabled()).toBe(false);
  });
});
