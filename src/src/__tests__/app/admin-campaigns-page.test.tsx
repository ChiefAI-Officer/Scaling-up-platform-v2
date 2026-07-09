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

const mockFindMany = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/db", () => ({
  db: { assessmentCampaign: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
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
  mockFindMany.mockResolvedValue([]);
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
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("Admin Campaigns page — data + reuse", () => {
  it("queries INVITED, non-deleted campaigns (PUBLIC excluded) and passes the admin detail base path", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "ADMIN" } });
    await renderPage();

    const arg = mockFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({ accessMode: "INVITED", deletedAt: null });
    expect(listProps).toMatchObject({
      detailBasePath: "/admin/assessments/campaigns",
    });
  });
});
