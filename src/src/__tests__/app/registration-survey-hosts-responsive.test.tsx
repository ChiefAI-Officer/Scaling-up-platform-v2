import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);
const registrationFindMany = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));
jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({ user: { role: "ADMIN" } }),
}));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("next/link", () => function NextLinkMock({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={String(href)} data-next-link="true" {...props}>{children}</a>;
});
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/auth/authorization", () => ({ requireAdmin: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db", () => ({
  db: {
    registration: { findMany: (...args: unknown[]) => registrationFindMany(...args) },
    surveyTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    coach: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    survey: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/surveys/survey-filters", () => ({
  SurveyFilters: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => (
    <div data-testid="survey-filters" data-responsive={String(responsiveEnabled)} />
  ),
}));
jest.mock("@/lib/surveys/survey-service", () => ({
  getSurveyResults: jest.fn().mockResolvedValue({
    surveyType: "POST_WORKSHOP",
    totalResponses: 1,
    groups: [{ key: "coach-1", label: "Alex Coach", responseCount: 1 }],
    questionStats: [],
    responses: [],
  }),
  getSurveyResponseRows: jest.fn().mockResolvedValue({
    rows: [],
    questions: [],
    template: { surveyType: "POST_WORKSHOP" },
    totalCount: 0,
    cappedAt: null,
  }),
}));
jest.mock("@/app/(dashboard)/surveys/surveys-client", () => ({
  SurveysClient: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => (
    <div data-testid="surveys-client" data-responsive={String(responsiveEnabled)} />
  ),
}));

import AdminRegistrationsPage from "@/app/(dashboard)/admin/registrations/page";
import AdminSurveysPage from "@/app/(dashboard)/admin/surveys/page";
import AggregateSurveyResultsPage from "@/app/(dashboard)/admin/surveys/aggregate/page";
import SurveysPage from "@/app/(dashboard)/surveys/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(true);
  registrationFindMany.mockResolvedValue([]);
});

it("evaluates the server flag for registrations and keeps the disabled header exact", async () => {
  const enabled = render(await AdminRegistrationsPage());
  expect(document.querySelector("[data-responsive-page-header]")).toHaveTextContent("Contacts");
  const enabledExport = screen.getByRole("link", { name: "Export All" });
  expect(enabledExport).toHaveAttribute("href", "/api/registrations/export");
  expect(enabledExport).not.toHaveAttribute("data-next-link");
  expect(enabledExport).toHaveClass("min-h-11");
  expect(registrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  enabled.unmount();

  mockResponsiveFlag.mockReturnValue(false);
  render(await AdminRegistrationsPage());
  expect(document.querySelector("[data-responsive-page-header]")).toBeNull();
  expect(screen.getByRole("heading", { name: "Contacts" }).parentElement?.parentElement).toHaveAttribute(
    "class",
    "flex items-center justify-between",
  );
  const disabledExport = screen.getByRole("link", { name: "Export All" });
  expect(disabledExport).toHaveAttribute("href", "/api/registrations/export");
  expect(disabledExport).not.toHaveAttribute("data-next-link");
  expect(disabledExport).not.toHaveClass("min-h-11");
});

it("server-hosts both survey pages and their aggregate filters", async () => {
  render(<SurveysPage />);
  expect(screen.getByTestId("surveys-client")).toHaveAttribute("data-responsive", "true");

  const templatesPage = AdminSurveysPage();
  expect(templatesPage.props.className).toContain("min-w-0");

  const aggregate = render(await AggregateSurveyResultsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByTestId("survey-filters")).toHaveAttribute("data-responsive", "true");
  expect(screen.getByRole("heading", { name: "Aggregated Survey Results" }).closest("div.space-y-6")).toHaveClass("min-w-0 max-w-full");
  aggregate.unmount();

  mockResponsiveFlag.mockReturnValue(false);
  render(await AggregateSurveyResultsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByTestId("survey-filters")).toHaveAttribute("data-responsive", "false");
  expect(screen.getByRole("heading", { name: "Aggregated Survey Results" }).closest("div.space-y-6")).toHaveAttribute("class", "space-y-6");
});

it("bounds aggregate comparison tables and sizes its real drill-down actions only when enabled", async () => {
  const template = {
    id: "template-1",
    name: "Feedback",
    surveyType: "POST_WORKSHOP",
    _count: { surveys: 1 },
    questions: [],
  };
  const dbModule = jest.requireMock("@/lib/db") as {
    db: { surveyTemplate: { findMany: jest.Mock }; survey: { findMany: jest.Mock } };
  };
  dbModule.db.surveyTemplate.findMany.mockResolvedValue([template]);
  dbModule.db.survey.findMany.mockResolvedValue([{
    workshopId: "workshop-1",
    npsScore: 9,
    workshop: { title: "Growth Workshop", workshopCode: "GROW" },
  }]);

  const enabled = render(await AggregateSurveyResultsPage({
    searchParams: Promise.resolve({ templateId: "template-1", groupBy: "coach" }),
  }));
  expect(screen.getByRole("region", { name: "Survey results by coach table" })).toHaveClass("overflow-x-auto");
  expect(screen.getByRole("region", { name: "Survey results by workshop table" })).toHaveClass("overflow-x-auto");
  expect(screen.getByRole("link", { name: /Feedback/ })).toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "Growth Workshop" })).toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "View" })).toHaveClass("min-h-11");
  enabled.unmount();

  mockResponsiveFlag.mockReturnValue(false);
  render(await AggregateSurveyResultsPage({
    searchParams: Promise.resolve({ templateId: "template-1", groupBy: "coach" }),
  }));
  expect(screen.queryByRole("region", { name: "Survey results by coach table" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Survey results by workshop table" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Feedback/ })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("class", "text-primary hover:underline");
});
