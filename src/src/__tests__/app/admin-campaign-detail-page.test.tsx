/**
 * Wave Z (Z-2c) — admin campaign-detail page.
 *
 * Gate: no actor → /login; non-privileged → /unauthorized; canManageCampaign
 * "read" false → redirect to the ADMIN campaigns list (NEVER /portal). On ok,
 * CampaignDetail is rendered inside production admin chrome as a reduced-nav
 * host: basePath = admin list and portal-only links are hidden. The shared
 * canonical report anchor remains the report-native individual entry point.
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
}));

const mockGetApiActor = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: (...a: unknown[]) => mockGetApiActor(...a),
  isPrivilegedRole: (r: string) => r === "ADMIN" || r === "STAFF",
}));

const mockCanManage = jest.fn();
const mockCanViewGroup = jest.fn();
jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (db: unknown) => db,
  canManageCampaign: (...a: unknown[]) => mockCanManage(...a),
  canViewGroupReport: (...a: unknown[]) => mockCanViewGroup(...a),
}));

const mockOverview = jest.fn();
const mockRespondents = jest.fn();
jest.mock("@/lib/assessments/campaign-detail", () => ({
  asCampaignDetailDb: (db: unknown) => db,
  getCampaignOverview: (...a: unknown[]) => mockOverview(...a),
  getCampaignRespondents: (...a: unknown[]) => mockRespondents(...a),
}));

const mockFindFirst = jest.fn();
jest.mock("@/lib/db", () => ({
  db: { assessmentCampaign: { findFirst: (...a: unknown[]) => mockFindFirst(...a) } },
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
const mockGroupReportEnabled = jest.fn(() => false);
const mockGroupReportAlias = jest.fn(() => false);
jest.mock("@/lib/assessments/wave-f-flags", () => ({
  isGroupReportEnabled: (...a: unknown[]) => mockGroupReportEnabled(...a),
  isGroupReportAlias: (...a: unknown[]) => mockGroupReportAlias(...a),
  groupReportRequiresPublishedVersion: () => true,
}));
jest.mock("@/lib/assessments/wave-report-styles-flags", () => ({
  isReportStylesEnabled: () => true,
  isReportStyleSelectionEnabled: () => true,
}));

let detailProps: Record<string, unknown> | null = null;
jest.mock("@/components/assessments/CampaignDetail", () => ({
  CampaignDetail: (props: Record<string, unknown>) => {
    detailProps = props;
    return null;
  },
}));

import { render } from "@testing-library/react";
import AdminCampaignDetailPage from "@/app/(dashboard)/admin/assessments/campaigns/[id]/page";

// Await the server component (redirects throw here) then render the returned
// tree so the mocked CampaignDetail executes and captures its props.
async function renderPage(id = "camp-1") {
  const el = await AdminCampaignDetailPage({ params: Promise.resolve({ id }) });
  render(el);
  return el;
}

beforeEach(() => {
  jest.clearAllMocks();
  detailProps = null;
  mockGroupReportEnabled.mockReturnValue(false);
  mockGroupReportAlias.mockReturnValue(false);
  mockOverview.mockResolvedValue({
    campaign: { id: "camp-1", name: "Acme Q3", templateName: "Scaling Up Full", organizationId: "org-1", templateId: "tpl-1", alias: "acme-q3" },
  });
  mockRespondents.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue({
    id: "camp-1",
    status: "ACTIVE",
    accessMode: "INVITED",
    createdByCoachId: "coach-1",
    organizationId: "org-1",
    template: {
      alias: "leadership-vision-alignment",
      resultsEmailContentApproved: true,
      resultsEmailContentApprovedHash: "approved-hash",
      resultsEmailSubject: "Your results",
      resultsEmailBodyMarkdown: "Your report is ready.",
    },
    version: { id: "v1", publishedAt: new Date("2026-01-01") },
  });
  mockCanViewGroup.mockResolvedValue(true);
  delete process.env.WAVE_INVITATION_BANNER_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_CANARY;
  delete process.env.WAVE_INVITATION_BANNER_KILL;
  delete process.env.SUMMARY_REPORTING_ENABLED;
  delete process.env.SUMMARY_REPORTING_CANARY;
  delete process.env.SUMMARY_REPORTING_KILL;
});

afterEach(() => {
  delete process.env.WAVE_INVITATION_BANNER_ENABLED;
  delete process.env.WAVE_INVITATION_BANNER_CANARY;
  delete process.env.WAVE_INVITATION_BANNER_KILL;
  delete process.env.SUMMARY_REPORTING_ENABLED;
  delete process.env.SUMMARY_REPORTING_CANARY;
  delete process.env.SUMMARY_REPORTING_KILL;
});

describe("Admin campaign detail — auth gate", () => {
  it("redirects to /login when no actor", async () => {
    mockGetApiActor.mockResolvedValue(null);
    await expect(renderPage()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/login" });
  });

  it("redirects a COACH to /unauthorized", async () => {
    mockGetApiActor.mockResolvedValue({ role: "COACH", coachId: "c1", userId: "u1", email: "c@x.com" });
    await expect(renderPage()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/unauthorized" });
  });

  it.each(["ADMIN", "STAFF"])(
    "redirects %s to the ADMIN campaigns list (not /portal) when canManageCampaign is false",
    async (role) => {
      mockGetApiActor.mockResolvedValue({ role, coachId: null, userId: "u1", email: "a@x.com" });
      mockCanManage.mockResolvedValue(false);
      await expect(renderPage()).rejects.toMatchObject({
        digest: "NEXT_REDIRECT;/admin/assessments/campaigns",
      });
    },
  );
});

describe("Admin campaign detail — production chrome and report-native placement", () => {
  it("renders CampaignDetail in admin chrome with the shared canonical report destination", async () => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);

    await renderPage();

    expect(detailProps).toMatchObject({
      basePath: "/admin/assessments/campaigns",
      hidePortalOnlyLinks: true,
      customHtmlEmailEnabled: false,
      brandedCustomHtmlEnabled: true,
      reportStylesAvailable: true,
      canEditReportAppearance: false,
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
    expect(detailProps).not.toHaveProperty("resultsEmailContentApprovedHash");
    expect(detailProps).toHaveProperty(
      "groupReportHref",
      "/assessments/camp-1/report",
    );
    // The coach-only rollback affordance is not promoted into admin chrome.
    expect(detailProps).not.toHaveProperty("legacyOverTimeRespondentIds");
  });
});

describe("Admin campaign detail — invitation banner authoring state", () => {
  it("passes exact server-derived campaign enablement, including the kill switch", async () => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);
    process.env.WAVE_INVITATION_BANNER_CANARY = "org-1";

    await renderPage();
    expect(detailProps).toHaveProperty("invitationBannerEnabled", true);

    process.env.WAVE_INVITATION_BANNER_KILL = "1";
    await renderPage();
    expect(detailProps).toHaveProperty("invitationBannerEnabled", false);
  });

  it.each([
    ["global enablement", "global"],
    ["template canary", "template"],
  ])("keeps PUBLIC authoring outside the universal body-only contract under %s", async (_name, mode) => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);
    mockFindFirst.mockResolvedValue({
      id: "camp-1",
      status: "DRAFT",
      accessMode: "PUBLIC",
      createdByCoachId: null,
      organizationId: null,
      template: { alias: "rockefeller" },
      version: { id: "v1", publishedAt: new Date("2026-01-01") },
    });
    if (mode === "global") process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    else process.env.WAVE_INVITATION_BANNER_CANARY = "tpl-1";

    await renderPage();

    expect(detailProps).toHaveProperty("invitationBannerEnabled", false);
  });
});

describe("Admin campaign detail — Summary Reports capability", () => {
  it("keeps the Five Dysfunctions group-report entry coach-side only", async () => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);
    mockGroupReportEnabled.mockReturnValue(true);
    mockGroupReportAlias.mockReturnValue(true);
    mockFindFirst.mockResolvedValue({
      id: "camp-1",
      status: "ACTIVE",
      accessMode: "INVITED",
      createdByCoachId: "coach-1",
      organizationId: "org-1",
      template: { alias: "five-dysfunctions" },
      version: { id: "v1", publishedAt: new Date("2026-01-01") },
    });

    await renderPage();

    expect(detailProps).toHaveProperty("canViewGroupReport", false);
    expect(mockCanViewGroup).not.toHaveBeenCalled();
  });

  it("never passes the Summary Reports panel capability and keeps the canonical group report", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);
    mockGroupReportEnabled.mockReturnValue(true);
    mockGroupReportAlias.mockReturnValue(true);
    mockFindFirst.mockResolvedValue({
      id: "camp-1",
      status: "ACTIVE",
      accessMode: "INVITED",
      createdByCoachId: "coach-1",
      organizationId: "org-1",
      template: { alias: "scaling-up-full" },
      version: { id: "v1", publishedAt: new Date("2026-01-01") },
    });

    await renderPage();

    expect(detailProps).not.toHaveProperty("summaryReporting");
    expect(detailProps).toMatchObject({
      canViewGroupReport: true,
      groupReportHref: "/assessments/camp-1/report",
      basePath: "/admin/assessments/campaigns",
      hidePortalOnlyLinks: true,
      brandedCustomHtmlEnabled: true,
      reportStylesAvailable: true,
      canEditReportAppearance: false,
      resultsEmailEnabled: true,
      resultsEmailApproved: true,
      coachNotifyEnabled: true,
    });
    expect(mockCanViewGroup).toHaveBeenCalledTimes(1);
    expect(detailProps).not.toHaveProperty("resultsEmailContentApprovedHash");
  });

  it("does not add a group-report authorization lookup when only Summary Reporting is enabled", async () => {
    process.env.SUMMARY_REPORTING_ENABLED = "1";
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);
    mockFindFirst.mockResolvedValue({
      id: "camp-1",
      status: "ACTIVE",
      accessMode: "INVITED",
      createdByCoachId: "coach-1",
      organizationId: "org-1",
      template: { alias: "scaling-up-full" },
      version: { id: "v1", publishedAt: new Date("2026-01-01") },
    });

    await renderPage();

    expect(detailProps).not.toHaveProperty("summaryReporting");
    expect(detailProps).toHaveProperty("canViewGroupReport", false);
    expect(mockCanViewGroup).not.toHaveBeenCalled();
  });
});
