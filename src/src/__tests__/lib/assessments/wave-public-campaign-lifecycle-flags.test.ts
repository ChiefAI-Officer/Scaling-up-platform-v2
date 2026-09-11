import { isPublicCampaignLifecycleEnabled } from "@/lib/assessments/wave-public-campaign-lifecycle-flags";

const ENABLED = "WAVE_PUBLIC_CAMPAIGN_LIFECYCLE_ENABLED";
const KILL = "WAVE_PUBLIC_CAMPAIGN_LIFECYCLE_KILL";

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
});

it.each([undefined, "", "0", "false"])("is off for %p", (value) => {
  if (value !== undefined) process.env[ENABLED] = value;
  expect(isPublicCampaignLifecycleEnabled()).toBe(false);
});

it.each(["1", "true", "TRUE", "yes"])("is on for %s", (value) => {
  process.env[ENABLED] = value;
  expect(isPublicCampaignLifecycleEnabled()).toBe(true);
});

it("lets the kill switch override enablement", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "yes";
  expect(isPublicCampaignLifecycleEnabled()).toBe(false);
});

it("reads the environment at call time", () => {
  expect(isPublicCampaignLifecycleEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isPublicCampaignLifecycleEnabled()).toBe(true);
});
