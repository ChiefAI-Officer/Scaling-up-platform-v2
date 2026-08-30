/**
 * Wave J (J-3) — entry-point publish gate on the coach CampaignDetail page.
 *
 * The "View group report" entry link must be hidden for a DRAFT (unpublished)
 * SCORED campaign (SU-Full, Rockefeller) EVEN when the flag is on — lock-step
 * with the loader's publish guard, which is keyed on scored report type (#72
 * DT-5). Qualitative surfaces (LVA, QSP) are NEVER gated on publishedAt.
 *
 * Strategy: drive the REAL server component with every leaf mocked, and capture
 * the `canViewGroupReport` boolean the page hands to <CampaignDetail>. We assert
 * ONLY that boolean (the page's whole job for this gate).
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
}));

jest.mock("@/lib/auth/access-control", () => ({
  normalizeRole: (r: string) => r,
}));

const mockCanManageCampaign = jest.fn();
const mockCanViewGroupReport = jest.fn();
jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (x: unknown) => x,
  canManageCampaign: (...a: unknown[]) => mockCanManageCampaign(...a),
  canViewGroupReport: (...a: unknown[]) => mockCanViewGroupReport(...a),
}));

const mockGetCampaignOverview = jest.fn();
const mockGetCampaignRespondents = jest.fn();
jest.mock("@/lib/assessments/campaign-detail", () => {
  const actual = jest.requireActual("@/lib/assessments/campaign-detail");
  return {
    ...actual,
    asCampaignDetailDb: (x: unknown) => x,
    getCampaignOverview: (...a: unknown[]) => mockGetCampaignOverview(...a),
    getCampaignRespondents: (...a: unknown[]) => mockGetCampaignRespondents(...a),
  };
});

const mockHasComparableLongitudinal = jest.fn();
jest.mock("@/lib/assessments/longitudinal-eligibility", () => ({
  asLongitudinalEligibilityDb: (x: unknown) => x,
  hasComparableLongitudinal: (...a: unknown[]) =>
    mockHasComparableLongitudinal(...a),
}));

const mockResultsEmailFlag = jest.fn(() => true);
const mockCoachNotifyFlag = jest.fn(() => true);
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDCustomHtmlEmailEnabled: () => false,
  waveDResultsEmailEnabled: () => mockResultsEmailFlag(),
  waveDCoachNotifyEnabled: () => mockCoachNotifyFlag(),
  assessmentInviteBrandedCustomHtmlEnabled: jest.fn(() => true),
}));
const mockIsResultsEmailApproved = jest.fn(() => true);
jest.mock("@/lib/assessments/results-email-approval", () => ({
  isResultsEmailApproved: (...a: unknown[]) => mockIsResultsEmailApproved(...a),
}));

const mockReportComparisonEnabled = jest.fn();
jest.mock("@/lib/assessments/wave-report-comparison-flags", () => ({
  REPORT_COMPARISON_ALIAS: "scaling-up-full",
  isReportComparisonEnabled: (...args: unknown[]) =>
    mockReportComparisonEnabled(...args),
}));

// NOTE: @/lib/assessments/wave-f-flags is intentionally NOT mocked — the page
// must consult the REAL alias-aware isGroupReportEnabled + isGroupReportAlias;
// enablement is driven via env vars per-test.

const mockFindFirst = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
  },
}));

// Capture the props handed to CampaignDetail.
let captured: Record<string, unknown> = {};
jest.mock("@/components/assessments/CampaignDetail", () => ({
  CampaignDetail: (props: Record<string, unknown>) => {
    captured = props;
    return null;
  },
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/(portal)/portal/assessments/[id]/page";

const CAMPAIGN_ID = "camp-1";
const TEMPLATE_ID = "tpl-1";

function coachSession() {
  return {
    session: {
      user: { id: "user-1", email: "coach@example.com", role: "COACH" },
    },
    coach: { id: "coach-1" },
  };
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    status: "ACTIVE",
    accessMode: "INVITED",
    createdByCoachId: "coach-1",
    organizationId: "org-1",
    template: {
      alias: "scaling-up-full",
      resultsEmailContentApproved: true,
      resultsEmailContentApprovedHash: "approved-hash",
      resultsEmailSubject: "Your results",
      resultsEmailBodyMarkdown: "Your report is ready.",
    },
    version: { publishedAt: new Date("2026-06-01T00:00:00Z") },
    ...overrides,
  };
}

async function runPage() {
  captured = {};
  const node = await Page({ params: Promise.resolve({ id: CAMPAIGN_ID }) });
  // Render the returned tree so the (mocked) CampaignDetail is invoked and
  // captures the canViewGroupReport boolean the page computed.
  renderToStaticMarkup(node as React.ReactElement);
  return captured.canViewGroupReport;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCoach.mockResolvedValue(coachSession());
  mockCanManageCampaign.mockResolvedValue(true);
  mockCanViewGroupReport.mockResolvedValue(true);
  // Overview carries the campaign fields the Wave N loop reads.
  mockGetCampaignOverview.mockResolvedValue({
    campaign: {
      name: "Acme Q3",
      templateName: "Scaling Up Full",
      organizationId: "org-1",
      templateId: TEMPLATE_ID,
      templateAlias: "scaling-up-full",
      status: "ACTIVE",
      reportStyleLockedAt: null,
      alias: "su-full-campaign-slug", // CAMPAIGN slug, deliberately NOT the template alias
    },
  });
  mockGetCampaignRespondents.mockResolvedValue([]);
  mockHasComparableLongitudinal.mockResolvedValue(false);
  mockReportComparisonEnabled.mockReturnValue(false);
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
  delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
  delete process.env.WAVE_J_SUFULL_GROUP_CANARY;
  delete process.env.WAVE_J_SUFULL_GROUP_KILL;
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
  delete process.env.WAVE_INVITATION_BANNER_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_CANARY;
  delete process.env.WAVE_INVITATION_BANNER_KILL;
  delete process.env.SUMMARY_REPORTING_ENABLED;
  delete process.env.SUMMARY_REPORTING_CANARY;
  delete process.env.SUMMARY_REPORTING_KILL;
});

afterEach(() => {
  delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_ENABLED;
  delete process.env.WAVE_REPORT_STYLES_KILL;
  delete process.env.WAVE_REPORT_STYLES_CANARY;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
  delete process.env.WAVE_INVITATION_BANNER_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_CANARY;
  delete process.env.WAVE_INVITATION_BANNER_KILL;
  delete process.env.SUMMARY_REPORTING_ENABLED;
  delete process.env.SUMMARY_REPORTING_CANARY;
  delete process.env.SUMMARY_REPORTING_KILL;
});

describe("CampaignDetail report appearance capability", () => {
  it("passes edit authority for the owning coach while available and unlocked", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured.canEditReportAppearance).toBe(true);
  });

  it("fails closed after the campaign appearance is locked", async () => {
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());
    mockGetCampaignOverview.mockResolvedValue({
      campaign: {
        organizationId: "org-1",
        templateId: TEMPLATE_ID,
        templateAlias: "scaling-up-full",
        status: "ACTIVE",
        reportStyleLockedAt: new Date("2026-08-06T04:00:00.000Z"),
        alias: "su-full-campaign-slug",
      },
    });

    await runPage();

    expect(captured.canEditReportAppearance).toBe(false);
  });

  it.each([null, new Date("2026-08-06T04:00:00.000Z")])(
    "suppresses coach appearance capability in admin-owned mode with lock %s",
    async (reportStyleLockedAt) => {
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      mockFindFirst.mockResolvedValue(makeCampaign());
      mockGetCampaignOverview.mockResolvedValue({
        campaign: {
          organizationId: "org-1",
          templateId: TEMPLATE_ID,
          templateAlias: "scaling-up-full",
          status: "ACTIVE",
          reportStyleLockedAt,
          alias: "su-full-campaign-slug",
        },
      });

      await runPage();

      expect(captured.reportStylesAvailable).toBe(false);
      expect(captured.canEditReportAppearance).toBe(false);
      expect(captured.reportStylePreviewCapabilities).toBeUndefined();
      expect(captured.groupReportHref).toBe(`/assessments/${CAMPAIGN_ID}/report`);
    },
  );
});

describe("CampaignDetail email capabilities", () => {
  it("passes server-computed email capabilities without exposing approval inputs", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured).toMatchObject({
      resultsEmailEnabled: true,
      resultsEmailApproved: true,
      coachNotifyEnabled: true,
    });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          template: {
            select: expect.objectContaining({
              resultsEmailContentApproved: true,
              resultsEmailContentApprovedHash: true,
              resultsEmailSubject: true,
              resultsEmailBodyMarkdown: true,
            }),
          },
        }),
      }),
    );
    expect(captured).not.toHaveProperty("resultsEmailContentApprovedHash");
  });
});

describe("CampaignDetail invitation banner authoring state", () => {
  it("passes exact server-derived campaign enablement", async () => {
    process.env.WAVE_INVITATION_BANNER_CANARY = "tpl-1";
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured.invitationBannerEnabled).toBe(true);
  });

  it.each([
    ["global enablement", "global"],
    ["template canary", "template"],
  ])("does not pass universal body-only authoring to a PUBLIC campaign under %s", async (_name, mode) => {
    if (mode === "global") process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    else process.env.WAVE_INVITATION_BANNER_CANARY = TEMPLATE_ID;
    mockFindFirst.mockResolvedValue(makeCampaign({ accessMode: "PUBLIC" }));

    await runPage();

    expect(captured.invitationBannerEnabled).toBe(false);
  });
});

describe("CampaignDetail entry-point publish gate (Wave J J-3)", () => {
  it("PUBLISHED SU-Full + WAVE_J on → canViewGroupReport true", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());
    expect(await runPage()).toBe(true);
  });

  it("DRAFT (unpublished) SU-Full → canViewGroupReport FALSE even with the flag on", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ version: { publishedAt: null } }),
    );
    expect(await runPage()).toBe(false);
  });

  it("SU-Full with WAVE_J off → canViewGroupReport false (flag-gated)", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());
    expect(await runPage()).toBe(false);
  });

  it("LVA with a NULL publishedAt → still true (publish guard is scored-only; LVA is qualitative)", async () => {
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({
        template: { alias: "leadership-vision-alignment" },
        version: { publishedAt: null },
      }),
    );
    expect(await runPage()).toBe(true);
  });

  it("non-allowlisted alias → false regardless of flags", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ template: { alias: "RockHabits" } }),
    );
    expect(await runPage()).toBe(false);
  });

  it("DRAFT SU-Full does not even consult canViewGroupReport (short-circuits on publish)", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ version: { publishedAt: null } }),
    );
    await runPage();
    expect(mockCanViewGroupReport).not.toHaveBeenCalled();
  });
});

describe("CampaignDetail Summary Reports capability", () => {
  it("passes the implemented Scaling catalog only for a published, authorized invited campaign", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured.summaryReporting).toEqual({
      campaignId: CAMPAIGN_ID,
      campaignName: "Acme Q3",
      assessmentName: "Scaling Up Full",
      implementedTypes: [
        {
          type: "SCALING_CEO_FULL",
          label: "Scaling Up · CEO Full",
          description: "Compare one CEO with an explicitly selected leadership team.",
        },
        {
          type: "SCALING_CONDENSED_CEO",
          label: "Scaling Up · Condensed CEO",
          description: "Create a two-page CEO score and peer appendix.",
        },
      ],
    });
  });

  it("shares report authorization without changing enabled presentation, email, or comparison capabilities", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    process.env.WAVE_REPORT_STYLES_ENABLED = "1";
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());
    mockGetCampaignRespondents.mockResolvedValue([
      { hasSubmission: true, respondent: { id: "resp-1" } },
    ]);
    mockReportComparisonEnabled.mockReturnValue(true);

    await runPage();

    expect(mockCanViewGroupReport).toHaveBeenCalledTimes(1);
    expect(captured).toMatchObject({
      canViewGroupReport: true,
      groupReportHref: `/assessments/${CAMPAIGN_ID}/report`,
      summaryReporting: { campaignId: CAMPAIGN_ID },
      brandedCustomHtmlEnabled: true,
      invitationBannerEnabled: true,
      resultsEmailEnabled: true,
      resultsEmailApproved: true,
      coachNotifyEnabled: true,
      reportStylesAvailable: false,
      canEditReportAppearance: false,
      legacyOverTimeRespondentIds: [],
    });
    expect(captured.reportStylePreviewCapabilities).toBeUndefined();
    expect(captured).not.toHaveProperty("resultsEmailContentApprovedHash");
    expect(mockHasComparableLongitudinal).not.toHaveBeenCalled();
  });

  it("does not add a group-report authorization lookup when summary reporting is flag-off", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured.summaryReporting).toBeNull();
    expect(mockCanViewGroupReport).not.toHaveBeenCalled();
  });

  it("withholds the capability from an unauthorized coach", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    mockCanViewGroupReport.mockResolvedValue(false);
    mockFindFirst.mockResolvedValue(makeCampaign());

    await runPage();

    expect(captured.summaryReporting).toBeNull();
  });

  it("keeps an unsupported family on its existing direct-link path", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ template: { alias: "leadership-vision-alignment" } }),
    );

    expect(await runPage()).toBe(true);
    expect(captured.summaryReporting).toBeNull();
  });
});

describe("CampaignDetail report-native placement", () => {
  const respondentRows = [
    { hasSubmission: true, respondent: { id: "resp-1" } },
    { hasSubmission: true, respondent: { id: "resp-2" } },
    { hasSubmission: false, respondent: { id: "resp-3" } }, // skipped (no submission)
  ];

  it("restores the Wave N eligibility loop and promoted links while report-native comparison is off", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());
    mockGetCampaignRespondents.mockResolvedValue(respondentRows);
    mockHasComparableLongitudinal.mockResolvedValue(true);
    await runPage();

    expect(mockHasComparableLongitudinal).toHaveBeenCalledTimes(2);
    expect(captured.legacyOverTimeRespondentIds).toEqual(["resp-1", "resp-2"]);
  });

  it("suppresses the Wave N N+1 loop and promoted links while report-native comparison is enabled", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());
    mockGetCampaignRespondents.mockResolvedValue(respondentRows);
    mockReportComparisonEnabled.mockReturnValue(true);
    await runPage();

    expect(mockHasComparableLongitudinal).not.toHaveBeenCalled();
    expect(captured.legacyOverTimeRespondentIds).toEqual([]);
  });
});
