import { render } from "@testing-library/react";

const responsiveFlag = jest.fn(() => true);
jest.mock("@/lib/mobile-responsive-flags", () => ({ isMobileResponsiveEnabled: () => responsiveFlag() }));
jest.mock("next-auth/next", () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { role: "ADMIN" } }) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/assessments/wave-q-flags", () => ({ isWaveQAdminControlsEnabled: () => true }));
jest.mock("@/lib/assessments/wave-public-campaigns-simple-ui-flags", () => ({ isPublicCampaignsSimpleUiEnabled: () => false }));
jest.mock("@/components/ui/page-header", () => ({ PageHeader: () => <header /> }));
jest.mock("@/components/admin/PeerBenchmarkStatusPanel", () => ({ PeerBenchmarkStatusPanel: () => <div /> }));

const mockCaptured: Record<string, unknown>[] = [];
function mockCapture(name: string) {
  return function CapturedComponent(props: Record<string, unknown>) {
    mockCaptured.push({ name, ...props });
    return <div data-testid={name} />;
  };
}
jest.mock("@/components/admin/AssessmentTemplatesList", () => ({ AssessmentTemplatesList: mockCapture("templates") }));
jest.mock("@/components/admin/AccessGroupsList", () => ({ AccessGroupsList: mockCapture("access-groups") }));
jest.mock("@/components/admin/AccessGroupDetail", () => ({ AccessGroupDetail: mockCapture("access-group-detail") }));
jest.mock("@/components/admin/PublicCampaignsManager", () => ({ PublicCampaignsManager: mockCapture("public-campaigns") }));
jest.mock("@/components/admin/public-campaigns/PublicCampaignList", () => ({ PublicCampaignList: mockCapture("simple-public-campaigns") }));
jest.mock("@/components/admin/ObservabilityDashboard", () => ({ ObservabilityDashboard: mockCapture("observability") }));
jest.mock("@/components/admin/ImportHealthPanel", () => ({ ImportHealthPanel: mockCapture("import-health") }));
jest.mock("@/components/admin/AssessmentsAggregateReport", () => ({ AssessmentsAggregateReport: mockCapture("aggregate") }));

import TemplatesPage from "@/app/(dashboard)/admin/assessments/templates/page";
import AccessGroupsPage from "@/app/(dashboard)/admin/assessments/access-groups/page";
import AccessGroupDetailPage from "@/app/(dashboard)/admin/assessments/access-groups/[id]/page";
import PublicCampaignsPage from "@/app/(dashboard)/admin/assessments/public-campaigns/page";
import ObservabilityPage from "@/app/(dashboard)/admin/assessments/observability/page";
import AggregatePage from "@/app/(dashboard)/admin/assessments/aggregate/page";

async function renderHosts() {
  render(await TemplatesPage());
  render(await AccessGroupsPage());
  render(await AccessGroupDetailPage({ params: Promise.resolve({ id: "group-1" }) }));
  render(await PublicCampaignsPage({ searchParams: Promise.resolve({}) }));
  render(await ObservabilityPage());
  render(await AggregatePage());
}

beforeEach(() => {
  mockCaptured.length = 0;
  responsiveFlag.mockReturnValue(true);
});

it("passes the server-evaluated responsive flag to every assessment collection presenter", async () => {
  await renderHosts();
  for (const name of ["templates", "access-groups", "access-group-detail", "public-campaigns", "observability", "import-health", "aggregate"]) {
    expect(mockCaptured.find((props) => props.name === name)).toMatchObject({ responsiveEnabled: true });
  }
});

it("passes false explicitly when the responsive gate is off", async () => {
  responsiveFlag.mockReturnValue(false);
  await renderHosts();
  for (const name of ["templates", "access-groups", "access-group-detail", "public-campaigns", "observability", "import-health", "aggregate"]) {
    expect(mockCaptured.find((props) => props.name === name)).toMatchObject({ responsiveEnabled: false });
  }
});
