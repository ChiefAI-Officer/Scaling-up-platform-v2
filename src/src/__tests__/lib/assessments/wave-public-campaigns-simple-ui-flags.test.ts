import { isPublicCampaignsSimpleUiEnabled } from "@/lib/assessments/wave-public-campaigns-simple-ui-flags";

const ENABLED = "WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED";
const KILL = "WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL";

afterEach(() => {
  delete process.env[ENABLED];
  delete process.env[KILL];
});

it.each([undefined, "", "0", "false"])("is off for %p", (value) => {
  if (value !== undefined) process.env[ENABLED] = value;
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
});

it.each(["1", "true", "TRUE", "yes"])("is on for %s", (value) => {
  process.env[ENABLED] = value;
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(true);
});

it("lets the kill switch override enablement", () => {
  process.env[ENABLED] = "1";
  process.env[KILL] = "yes";
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
});

it("reads the environment at call time", () => {
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(false);
  process.env[ENABLED] = "1";
  expect(isPublicCampaignsSimpleUiEnabled()).toBe(true);
});
