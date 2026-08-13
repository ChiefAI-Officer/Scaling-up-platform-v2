import { render, screen, within } from "@testing-library/react";
import { AccessGroupsList } from "@/components/admin/AccessGroupsList";
import { AccessGroupDetail } from "@/components/admin/AccessGroupDetail";
import { ObservabilityDashboard } from "@/components/admin/ObservabilityDashboard";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const accessGroup = {
  id: "group-1",
  name: "Growth Coaches",
  description: "Coaches serving growing companies",
  deletedAt: null,
  coachCount: 4,
  templateCount: 3,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: new Date().toISOString(),
};

afterEach(() => jest.restoreAllMocks());

it("keeps the exact access-groups table presentation when disabled", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [accessGroup] }),
  }) as unknown as typeof fetch;
  render(<AccessGroupsList responsiveEnabled={false} />);
  await screen.findByText("Growth Coaches");
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Access groups" })).not.toBeInTheDocument();
});

it("renders access groups as complete compact records with a touch-sized manage link", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: [accessGroup] }),
  }) as unknown as typeof fetch;
  render(<AccessGroupsList responsiveEnabled />);
  const list = await screen.findByRole("list", { name: "Access groups" });
  const card = await within(list).findByRole("article", { name: "Growth Coaches" });
  expect(within(card).getByText(accessGroup.description)).toBeInTheDocument();
  expect(within(card).getByText("4")).toBeInTheDocument();
  expect(within(card).getByText("3")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "Manage Growth Coaches" })).toHaveClass("min-h-11");
});

it("uses compact records for access-group members and grants without changing remove actions", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        id: "group-1",
        name: "Growth Coaches",
        description: "Coaches serving growing companies",
        accessPolicyVersion: "v1.intersection",
        createdBy: "admin-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
        deletedAt: null,
        creator: { id: "admin-1", email: "admin@example.com", name: "Admin" },
        coachMembers: [{
          id: "member-1",
          coachId: "coach-1",
          addedAt: "2026-08-02T00:00:00.000Z",
          addedBy: "admin-1",
          coach: { id: "coach-1", firstName: "Ada", lastName: "Coach", email: "ada@example.com", certificationStatus: "ACTIVE" },
        }],
        templateAccess: [{
          id: "grant-1",
          templateId: "template-1",
          addedAt: "2026-08-03T00:00:00.000Z",
          template: { id: "template-1", name: "Scaling Up Full", alias: "su-full", aggregationMode: "CEO_ONLY" },
        }],
      },
    }),
  }) as unknown as typeof fetch;
  render(<AccessGroupDetail accessGroupId="group-1" responsiveEnabled />);

  const coaches = await screen.findByRole("list", { name: "Coaches in access group" });
  const coach = within(coaches).getByRole("article", { name: "Ada Coach" });
  expect(within(coach).getByText("ada@example.com")).toBeInTheDocument();
  expect(within(coach).getByRole("button", { name: "Remove Ada Coach" })).toHaveClass("min-h-11");

  const templates = screen.getByRole("list", { name: "Templates in access group" });
  const template = within(templates).getByRole("article", { name: "Scaling Up Full" });
  expect(within(template).getByText("su-full")).toBeInTheDocument();
  expect(within(template).getByLabelText("CEO_ONLY aggregation")).toBeInTheDocument();
  expect(within(template).getByRole("button", { name: "Remove Scaling Up Full" })).toHaveClass("min-h-11");
});

it("reflows observability metrics and presents audit actions as compact records", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        coaches: { active: 2, pending: 1, deactivated: 0 },
        orgs: { total: 3, withCampaigns: 2 },
        templates: { total: 4, publishedVersions: 5, draftVersions: 1 },
        campaigns: { draft: 1, active: 2, closed: 3, invited: 4, public: 2 },
        submissions: { total: 9, last24h: 2, last7d: 7, public: 3, invited: 6 },
        auditLog: { last24h: 3, byAction: { "campaign.created": 2 } },
        timestamp: "2026-08-13T00:00:00.000Z",
      },
    }),
  }) as unknown as typeof fetch;
  render(<ObservabilityDashboard responsiveEnabled />);

  const audit = await screen.findByRole("list", { name: "Audit log by action" });
  expect(within(audit).getByText("campaign.created")).toBeInTheDocument();
  expect(within(audit).getByText("2")).toBeInTheDocument();
  expect(screen.getByTestId("observability-metrics-coaches")).toHaveClass("grid-cols-1 sm:grid-cols-3");
  expect(screen.getByTestId("refresh-observability")).toHaveClass("min-h-11");
});
