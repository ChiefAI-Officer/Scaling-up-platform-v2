jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
}));

const mockAssessmentTemplateFindMany = jest.fn();
const mockAccessGroupCoachFindMany = jest.fn();
const mockAccessGroupTemplateFindMany = jest.fn();
const mockOrganizationFindUnique = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: {
      findMany: (...args: unknown[]) => mockAssessmentTemplateFindMany(...args),
    },
    accessGroupCoach: {
      findMany: (...args: unknown[]) => mockAccessGroupCoachFindMany(...args),
    },
    accessGroupTemplate: {
      findMany: (...args: unknown[]) => mockAccessGroupTemplateFindMany(...args),
    },
    organization: {
      findUnique: (...args: unknown[]) => mockOrganizationFindUnique(...args),
    },
    coach: { findUnique: jest.fn() },
    assessmentCampaign: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDCustomHtmlEmailEnabled: () => true,
  assessmentInviteBrandedCustomHtmlEnabled: () => false,
  waveDAutoSendEnabled: () => false,
  waveDResultsEmailEnabled: () => false,
  waveDCoachNotifyEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-m-flags", () => ({
  isCustomSlidesEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-q-flags", () => ({
  isWaveQAdminControlsEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-osr-flags", () => ({
  isOnScreenResultsEnabled: () => false,
}));
jest.mock("@/lib/assessments/wave-admin-owned-assessment-presentation-flags", () => ({
  isAdminOwnedAssessmentPresentationEnabled: () => false,
}));

const mockCampaignWizard = jest.fn();
jest.mock("@/components/assessments/CampaignWizard", () => ({
  CampaignWizard: (props: Record<string, unknown>) => {
    mockCampaignWizard(props, undefined);
    return null;
  },
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NewCampaignPage from "@/app/(portal)/portal/assessments/new/page";

const ENV_KEYS = [
  "WAVE_INVITATION_BANNER_ENABLED",
  "WAVE_INVITATION_BANNER_CANARY",
  "WAVE_INVITATION_BANNER_KILL",
] as const;

type TemplateRow = {
  id: string;
  deletedAt: Date | null;
  disabledAt: Date | null;
};

const templateRows: TemplateRow[] = [
  { id: "tpl-live", deletedAt: null, disabledAt: null },
  { id: "tpl-shared", deletedAt: null, disabledAt: null },
  { id: "tpl-deleted", deletedAt: new Date("2026-01-01"), disabledAt: null },
  { id: "tpl-disabled", deletedAt: null, disabledAt: new Date("2026-01-01") },
];

function templateIdsFromWhere(where: unknown): string[] {
  const conditions = (where as { AND?: Array<Record<string, unknown>> }).AND ?? [];
  const configuredCondition = conditions.find(
    (condition) =>
      typeof condition.id === "object" &&
      condition.id !== null &&
      "in" in condition.id &&
      !("deletedAt" in condition) &&
      !("disabledAt" in condition),
  );
  return ((configuredCondition?.id as { in?: string[] } | undefined)?.in ?? []);
}

function scopedTemplateIdsFromWhere(where: unknown): string[] | null {
  const conditions = (where as { AND?: Array<Record<string, unknown>> }).AND ?? [];
  const scopeCondition = conditions.find(
    (condition) =>
      typeof condition.id === "object" &&
      condition.id !== null &&
      "in" in condition.id &&
      "deletedAt" in condition &&
      "disabledAt" in condition,
  );
  return (scopeCondition?.id as { in?: string[] } | undefined)?.in ?? null;
}

function renderTemplateQuery(args: { where: unknown }): Array<{ id: string }> {
  const configuredIds = templateIdsFromWhere(args.where);
  const scopeIds = scopedTemplateIdsFromWhere(args.where);
  return templateRows
    .filter(
      (row) =>
        configuredIds.includes(row.id) &&
        row.deletedAt === null &&
        row.disabledAt === null &&
        (scopeIds === null || scopeIds.includes(row.id)),
    )
    .map(({ id }) => ({ id }));
}

async function renderPage() {
  const node = await NewCampaignPage();
  renderToStaticMarkup(node as React.ReactElement);
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  mockRequireCoach.mockResolvedValue({
    session: {
      user: { id: "user-1", email: "coach@example.com", role: "COACH" },
    },
    coach: { id: "coach-1" },
  });
  mockAssessmentTemplateFindMany.mockImplementation(renderTemplateQuery);
  mockAccessGroupCoachFindMany.mockResolvedValue([
    {
      accessGroupId: "group-one",
      coachId: "coach-1",
      accessGroup: { id: "group-one", deletedAt: null },
    },
    {
      accessGroupId: "group-two",
      coachId: "coach-1",
      accessGroup: { id: "group-two", deletedAt: null },
    },
    {
      accessGroupId: "deleted-group",
      coachId: "coach-1",
      accessGroup: { id: "deleted-group", deletedAt: new Date("2026-01-01") },
    },
  ]);
  mockAccessGroupTemplateFindMany.mockResolvedValue([
    { accessGroupId: "group-one", templateId: "tpl-shared" },
    { accessGroupId: "group-two", templateId: "tpl-shared" },
    { accessGroupId: "group-one", templateId: "tpl-one-group-only" },
    { accessGroupId: "group-two", templateId: "tpl-stale-grant" },
    { accessGroupId: "group-one", templateId: "tpl-stale-grant" },
  ]);
  mockOrganizationFindUnique.mockImplementation(async ({ where }) => {
    const organizations: Record<
      string,
      { id: string; ownerCoachId: string; deletedAt: Date | null }
    > = {
      "org-owned": { id: "org-owned", ownerCoachId: "coach-1", deletedAt: null },
      "org-inaccessible": {
        id: "org-inaccessible",
        ownerCoachId: "coach-other",
        deletedAt: null,
      },
      "org-deleted": {
        id: "org-deleted",
        ownerCoachId: "coach-1",
        deletedAt: new Date("2026-01-01"),
      },
    };
    return organizations[where.id] ?? null;
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("portal new-campaign invitation banner snapshot", () => {
  it.each(["ADMIN", "STAFF"])(
    "retains only live Template canaries for a %s actor",
    async (role) => {
      mockRequireCoach.mockResolvedValue({
        session: { user: { id: "user-1", email: "admin@example.com", role } },
        coach: { id: "coach-1" },
      });
      process.env.WAVE_INVITATION_BANNER_CANARY =
        "tpl-live tpl-deleted tpl-disabled tpl-invalid";

      await renderPage();

      expect(mockCampaignWizard).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationBannerGate: {
            globallyEnabled: false,
            canaryIds: ["tpl-live"],
          },
        }),
        undefined,
      );
      expect(mockAssessmentTemplateFindMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { deletedAt: null, disabledAt: null },
            { id: { in: ["tpl-live", "tpl-deleted", "tpl-disabled", "tpl-invalid"] } },
          ],
        },
        select: { id: true },
      });
    },
  );

  it("keeps a coach to the shared live Template scope", async () => {
    process.env.WAVE_INVITATION_BANNER_CANARY =
      "tpl-live tpl-shared tpl-one-group-only tpl-stale-grant tpl-deleted tpl-disabled tpl-invalid";

    await renderPage();

    expect(mockCampaignWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationBannerGate: {
          globallyEnabled: false,
          canaryIds: ["tpl-shared"],
        },
      }),
      undefined,
    );
    expect(mockAssessmentTemplateFindMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            id: { in: ["tpl-shared", "tpl-stale-grant"] },
            deletedAt: null,
            disabledAt: null,
          },
          {
            id: {
              in: [
                "tpl-live",
                "tpl-shared",
                "tpl-one-group-only",
                "tpl-stale-grant",
                "tpl-deleted",
                "tpl-disabled",
                "tpl-invalid",
              ],
            },
          },
        ],
      },
      select: { id: true },
    });
  });

  it("keeps a live owned Organization canary but omits inaccessible Organization IDs", async () => {
    process.env.WAVE_INVITATION_BANNER_CANARY =
      "org-owned org-inaccessible org-deleted org-invalid tpl-shared";

    await renderPage();

    expect(mockCampaignWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationBannerGate: {
          globallyEnabled: false,
          canaryIds: ["org-owned", "tpl-shared"],
        },
      }),
      undefined,
    );
  });

  it("renders the default-off snapshot without Template, Organization, or access-group queries", async () => {
    await renderPage();

    expect(mockCampaignWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationBannerGate: {
          globallyEnabled: false,
          canaryIds: [],
        },
      }),
      undefined,
    );
    expect(mockAssessmentTemplateFindMany).not.toHaveBeenCalled();
    expect(mockOrganizationFindUnique).not.toHaveBeenCalled();
    expect(mockAccessGroupCoachFindMany).not.toHaveBeenCalled();
    expect(mockAccessGroupTemplateFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["global enablement", "WAVE_INVITATION_BANNER_ENABLED"],
    ["KILL", "WAVE_INVITATION_BANNER_KILL"],
  ])("renders an IDs-empty snapshot under %s without access queries", async (_name, flag) => {
    process.env[flag as (typeof ENV_KEYS)[number]] = "1";
    process.env.WAVE_INVITATION_BANNER_ENABLED = "1";
    process.env.WAVE_INVITATION_BANNER_CANARY = "org-cross-tenant tpl-cross-tenant";

    await renderPage();

    expect(mockCampaignWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        invitationBannerGate: {
          globallyEnabled: flag === "WAVE_INVITATION_BANNER_ENABLED",
          canaryIds: [],
        },
      }),
      undefined,
    );
    expect(mockAssessmentTemplateFindMany).not.toHaveBeenCalled();
    expect(mockOrganizationFindUnique).not.toHaveBeenCalled();
    expect(mockAccessGroupCoachFindMany).not.toHaveBeenCalled();
    expect(mockAccessGroupTemplateFindMany).not.toHaveBeenCalled();
  });
});
