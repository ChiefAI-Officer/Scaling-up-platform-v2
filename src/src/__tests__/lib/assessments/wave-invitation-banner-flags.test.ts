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

  it("lets KILL override global enable and returns an empty authoring snapshot", async () => {
    process.env[ENABLED] = "1";
    process.env[CANARY] = "org_1";
    process.env[KILL] = "1";
    const filterVisibleIds = jest.fn(async () => ["org_1"]);

    expect(isInvitationBannerEnabled({ organizationId: "org_1" })).toBe(false);
    await expect(
      getInvitationBannerAuthoringGate(filterVisibleIds),
    ).resolves.toEqual({
      globallyEnabled: false,
      canaryIds: [],
    });
    expect(filterVisibleIds).not.toHaveBeenCalled();
  });

  it("keeps only configured IDs returned by the picker-visibility batch filter", async () => {
    process.env[CANARY] = "org-1 tpl-live tpl-hidden org-1";
    const filterVisibleIds = jest.fn(
      async (configuredIds: readonly string[]) => {
        expect(configuredIds).toEqual(["org-1", "tpl-live", "tpl-hidden"]);
        return ["tpl-live", "not-configured", "org-1"];
      },
    );

    await expect(
      getInvitationBannerAuthoringGate(filterVisibleIds),
    ).resolves.toEqual({
      globallyEnabled: false,
      canaryIds: ["org-1", "tpl-live"],
    });
  });

  it("omits canary IDs when global enablement makes them irrelevant", async () => {
    process.env[ENABLED] = "1";
    process.env[CANARY] = "cross_tenant_org cross_tenant_template";
    const filterVisibleIds = jest.fn(async () => ["cross_tenant_org"]);

    await expect(
      getInvitationBannerAuthoringGate(filterVisibleIds),
    ).resolves.toEqual({
      globallyEnabled: true,
      canaryIds: [],
    });
    expect(filterVisibleIds).not.toHaveBeenCalled();
  });
});
