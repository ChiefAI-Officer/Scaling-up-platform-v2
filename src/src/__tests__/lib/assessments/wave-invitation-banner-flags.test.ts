import {
  getInvitationBannerAuthoringGate,
  isInvitationBannerEnabled,
} from "@/lib/assessments/wave-invitation-banner-flags";

const ENABLED = "WAVE_INVITATION_BANNER_ENABLED";
const CANARY = "WAVE_INVITATION_BANNER_CANARY";
const KILL = "WAVE_INVITATION_BANNER_KILL";
const ENV_KEYS = [ENABLED, CANARY, KILL] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function clearInvitationBannerEnvironment() {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(clearInvitationBannerEnvironment);
afterEach(clearInvitationBannerEnvironment);

afterAll(() => {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

describe("invitation banner gate", () => {
  it("defaults OFF without any environment configuration", () => {
    expect(isInvitationBannerEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes"])(
    "enables globally for ENABLED=%s",
    (value) => {
      process.env[ENABLED] = value;

      expect(isInvitationBannerEnabled()).toBe(true);
    },
  );

  it("matches only exact organization or template canary IDs", () => {
    process.env[CANARY] = "org_1, tpl_2";

    expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(true);
    expect(isInvitationBannerEnabled({ templateId: "tpl_2" })).toBe(true);
    expect(isInvitationBannerEnabled({ organizationId: "org_10" })).toBe(false);
  });

  it("reads canary configuration at call time", () => {
    expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(false);

    process.env[CANARY] = "org_1";

    expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(true);
  });

  it("lets KILL override global enable and returns an empty authoring snapshot", () => {
    process.env[ENABLED] = "1";
    process.env[KILL] = "1";

    expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(false);
    expect(getInvitationBannerAuthoringGate()).toEqual({
      globallyEnabled: false,
      canaryIds: [],
    });
  });

  it("deduplicates the authoring snapshot canary IDs", () => {
    process.env[CANARY] = " org_1, tpl_2 org_1 ";

    expect(getInvitationBannerAuthoringGate()).toEqual({
      globallyEnabled: false,
      canaryIds: ["org_1", "tpl_2"],
    });
  });
});
