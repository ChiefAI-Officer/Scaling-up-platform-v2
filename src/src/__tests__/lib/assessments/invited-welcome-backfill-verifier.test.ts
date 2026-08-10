import { verifyInvitedWelcomeBackfill } from "@/lib/assessments/invited-welcome-backfill-verifier";
import { resolveLegacyInvitedWelcomeConfig } from "@/lib/assessments/invited-welcome-config";

describe("invited Welcome backfill verifier", () => {
  it("reports valid invited coverage and untouched public campaigns", () => {
    const qsp = resolveLegacyInvitedWelcomeConfig("qsp-v2");
    const result = verifyInvitedWelcomeBackfill({
      templates: [
        { id: "t1", alias: "qsp-v2", deletedAt: null, invitedWelcomeDefault: qsp },
        { id: "t2", alias: "old", deletedAt: new Date(), invitedWelcomeDefault: null },
      ],
      campaigns: [
        { id: "c1", accessMode: "INVITED", templateAlias: "qsp-v2", invitedWelcomeSnapshot: qsp },
        { id: "c2", accessMode: "PUBLIC", templateAlias: "qsp-v2", invitedWelcomeSnapshot: null },
      ],
      immutabilityTriggerPresent: true,
    });

    expect(result).toEqual({
      templatesTotal: 2,
      templatesNonDeleted: 1,
      templatesNull: 0,
      templatesInvalid: 0,
      templatesMismatched: 0,
      invitedCampaignsTotal: 1,
      invitedCampaignsNull: 0,
      invitedCampaignsInvalid: 0,
      invitedCampaignsMismatched: 0,
      publicCampaignsTotal: 1,
      publicCampaignsWithSnapshot: 0,
      immutabilityTriggerPresent: true,
      byTemplateAlias: {
        "qsp-v2": { templates: 1, invitedCampaigns: 1, publicCampaigns: 1 },
      },
      ok: true,
    });
  });

  it("fails on missing or invalid required data and public snapshots", () => {
    const result = verifyInvitedWelcomeBackfill({
      templates: [
        { id: "t1", alias: "qsp-v2", deletedAt: null, invitedWelcomeDefault: null },
        { id: "t2", alias: "broken", deletedAt: null, invitedWelcomeDefault: { schemaVersion: 2 } },
      ],
      campaigns: [
        { id: "c1", accessMode: "INVITED", templateAlias: "qsp-v2", invitedWelcomeSnapshot: null },
        { id: "c2", accessMode: "INVITED", templateAlias: "broken", invitedWelcomeSnapshot: {} },
        {
          id: "c3",
          accessMode: "PUBLIC",
          templateAlias: "qsp-v2",
          invitedWelcomeSnapshot: resolveLegacyInvitedWelcomeConfig("qsp-v2"),
        },
      ],
      immutabilityTriggerPresent: false,
    });

    expect(result.templatesNull).toBe(1);
    expect(result.templatesInvalid).toBe(1);
    expect(result.invitedCampaignsNull).toBe(1);
    expect(result.invitedCampaignsInvalid).toBe(1);
    expect(result.publicCampaignsWithSnapshot).toBe(1);
    expect(result.immutabilityTriggerPresent).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("fails schema-valid values that differ from the exact legacy alias contract", () => {
    const changed = {
      ...resolveLegacyInvitedWelcomeConfig("qsp-v2"),
      eyebrow: "Changed but valid",
    };
    const result = verifyInvitedWelcomeBackfill({
      templates: [
        { id: "t1", alias: "qsp-v2", deletedAt: null, invitedWelcomeDefault: changed },
      ],
      campaigns: [
        {
          id: "c1",
          accessMode: "INVITED",
          templateAlias: "qsp-v2",
          invitedWelcomeSnapshot: changed,
        },
      ],
      immutabilityTriggerPresent: true,
    });

    expect(result.templatesMismatched).toBe(1);
    expect(result.invitedCampaignsMismatched).toBe(1);
    expect(result.ok).toBe(false);
  });
});
