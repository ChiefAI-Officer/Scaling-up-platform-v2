/**
 * Wave Z (Z-2c) — admin Campaigns oversight page.
 *
 * Gate: no session → /login; COACH → /unauthorized; ADMIN + STAFF render.
 * Data: loads accessMode="INVITED", deletedAt:null (PUBLIC excluded, imported
 * included) and hands CampaignsListWithFilter the admin detail base path.
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;${url}`,
    });
  }),
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth/next", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

const mockCampaignFindMany = jest.fn().mockResolvedValue([]);
const mockVersionFindMany = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: {
      findMany: (...args: unknown[]) => mockCampaignFindMany(...args),
    },
    assessmentTemplateVersion: {
      findMany: (...args: unknown[]) => mockVersionFindMany(...args),
    },
  },
}));

let listProps: Record<string, unknown> | null = null;
jest.mock("@/components/assessments/CampaignsListWithFilter", () => ({
  CampaignsListWithFilter: (props: Record<string, unknown>) => {
    listProps = props;
    return null;
  },
}));

import { render } from "@testing-library/react";
import AdminAssessmentCampaignsPage from "@/app/(dashboard)/admin/assessments/campaigns/page";

// Render the server component's returned tree so the mocked child components
// execute (capturing their props). Redirects throw before any return.
async function renderPage() {
  const el = await AdminAssessmentCampaignsPage();
  render(el);
  return el;
}

beforeEach(() => {
  jest.clearAllMocks();
  listProps = null;
  mockCampaignFindMany.mockResolvedValue([]);
  mockVersionFindMany.mockResolvedValue([]);
});

describe("Admin Campaigns page — auth gate", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("redirects a COACH to /unauthorized", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "COACH" } });
    await expect(renderPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/unauthorized",
    });
  });

  it.each(["ADMIN", "STAFF"])("renders for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { role } });
    await renderPage();
    expect(mockCampaignFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("Admin Campaigns page — data + reuse", () => {
  it("queries INVITED, non-deleted campaigns and projects their edition", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
    const pinned = {
      templateId: "tpl-1",
      versionNumber: 3,
      language: "enUS",
      publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      archivedAt: null,
    };
    mockCampaignFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Acme Q3",
        alias: "acme-q3",
        status: "ACTIVE",
        openAt: new Date("2026-07-31T00:00:00.000Z"),
        template: { id: "tpl-1", name: "QSP v2" },
        version: pinned,
        organization: { id: "org-1", name: "Acme" },
        participants: [],
        invitations: [],
      },
    ]);
    mockVersionFindMany.mockResolvedValue([pinned]);
    await renderPage();

    const arg = mockCampaignFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      include: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({ accessMode: "INVITED", deletedAt: null });
    expect(arg.include).toMatchObject({
      version: {
        select: {
          templateId: true,
          versionNumber: true,
          language: true,
          publishedAt: true,
          archivedAt: true,
        },
      },
    });
    expect(mockVersionFindMany).toHaveBeenCalledTimes(1);
    expect(listProps).toMatchObject({
      detailBasePath: "/admin/assessments/campaigns",
      campaigns: [
        expect.objectContaining({
          id: "c1",
          edition: {
            versionNumber: 3,
            newerEditionAvailable: false,
            pinnedRetired: false,
          },
        }),
      ],
    });
  });
});
