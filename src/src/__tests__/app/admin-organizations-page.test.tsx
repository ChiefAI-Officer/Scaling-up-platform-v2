/**
 * Wave Z (Z-3b) — admin Organizations directory page.
 *
 * Gate: no session → /login; COACH → /unauthorized; ADMIN + STAFF render.
 * Data: loads ALL non-deleted orgs (no coach filter) and hands MembersTeamsView
 * the reduced-host props (allowOrgCreate=false, hideEspertoImport).
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
  db: { organization: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));

let viewProps: Record<string, unknown> | null = null;
jest.mock("@/components/organizations/members-teams-view", () => ({
  MembersTeamsView: (props: Record<string, unknown>) => {
    viewProps = props;
    return null;
  },
}));

import { render } from "@testing-library/react";
import AdminAssessmentOrganizationsPage from "@/app/(dashboard)/admin/assessments/organizations/page";

beforeEach(() => {
  jest.clearAllMocks();
  viewProps = null;
  mockFindMany.mockResolvedValue([
    { id: "o1", name: "Acme Corp", ownerCoachId: "c1", externalId: null },
  ]);
});

describe("Admin Organizations page — auth gate", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(AdminAssessmentOrganizationsPage()).rejects.toThrow("NEXT_REDIRECT");
  });

  it("redirects a COACH to /unauthorized", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "COACH" } });
    await expect(AdminAssessmentOrganizationsPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;/unauthorized",
    });
  });

  it.each(["ADMIN", "STAFF"])("renders for %s", async (role) => {
    mockGetServerSession.mockResolvedValue({ user: { role } });
    await AdminAssessmentOrganizationsPage();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("Admin Organizations page — data + reduced host", () => {
  it("loads ALL non-deleted orgs and passes the reduced-host props", async () => {
    mockGetServerSession.mockResolvedValue({ user: { role: "STAFF" } });
    render(await AdminAssessmentOrganizationsPage());

    const arg = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ deletedAt: null });
    // No coach-ownership filter — admin sees every company.
    expect(arg.where).not.toHaveProperty("ownerCoachId");

    expect(viewProps).toMatchObject({
      allowOrgCreate: false,
      hideEspertoImport: true,
    });
    expect(
      (viewProps?.initialOrganizations as unknown[]).length,
    ).toBe(1);
  });
});
