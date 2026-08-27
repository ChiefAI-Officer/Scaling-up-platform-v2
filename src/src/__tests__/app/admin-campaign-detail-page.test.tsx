/**
 * Wave Z (Z-2c) — admin campaign-detail page.
 *
 * Gate: no actor → /login; non-privileged → /unauthorized; canManageCampaign
 * "read" false → redirect to the ADMIN campaigns list (NEVER /portal). On ok,
 * CampaignDetail is rendered as a reduced-nav admin host: basePath = admin
 * list, hidePortalOnlyLinks = true, and longitudinal is OMITTED (no prop →
 * CampaignDetail's own [] default → no "Over time" dead-ends).
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

jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDCustomHtmlEmailEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-f-flags", () => ({
  isGroupReportEnabled: () => false,
  isGroupReportAlias: () => false,
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
    template: { alias: "leadership-vision-alignment" },
    version: { id: "v1", publishedAt: new Date("2026-01-01") },
  });
  mockCanViewGroup.mockResolvedValue(true);
  delete process.env.SUMMARY_REPORTING_ENABLED;
  delete process.env.SUMMARY_REPORTING_CANARY;
  delete process.env.SUMMARY_REPORTING_KILL;
});

afterEach(() => {
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

describe("Admin campaign detail — reduced-nav host props", () => {
  it("renders CampaignDetail with admin basePath, portal-only links hidden, longitudinal omitted", async () => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);

    await renderPage();

    expect(detailProps).toMatchObject({
      basePath: "/admin/assessments/campaigns",
      hidePortalOnlyLinks: true,
    });
    // Longitudinal is intentionally NOT passed → CampaignDetail's own [] default.
    expect(detailProps).not.toHaveProperty("longitudinalRespondentIds");
  });
});

describe("Admin campaign detail — Summary Reports capability", () => {
  it("passes the same implemented Scaling catalog as the coach host", async () => {
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

    expect(detailProps).toMatchObject({
      summaryReporting: {
        campaignId: "camp-1",
        campaignName: "Acme Q3",
        assessmentName: "Scaling Up Full",
        implementedTypes: [
          {
            type: "SCALING_CEO_FULL",
            label: "Scaling Up · CEO Full",
            description: "Compare one CEO with an explicitly selected leadership team.",
          },
        ],
      },
    });
  });

  it("does not add a group-report authorization lookup when summary reporting is flag-off", async () => {
    mockGetApiActor.mockResolvedValue({ role: "ADMIN", coachId: null, userId: "u1", email: "a@x.com" });
    mockCanManage.mockResolvedValue(true);

    await renderPage();

    expect(detailProps).toMatchObject({ summaryReporting: null });
    expect(mockCanViewGroup).not.toHaveBeenCalled();
  });

  it("withholds the capability from an unauthorized admin actor", async () => {
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
    mockCanViewGroup.mockResolvedValue(false);

    await renderPage();

    expect(detailProps).toMatchObject({ summaryReporting: null });
  });
});
