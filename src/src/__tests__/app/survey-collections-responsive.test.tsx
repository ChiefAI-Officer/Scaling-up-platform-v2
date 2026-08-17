import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SurveyTemplatesView } from "@/app/(dashboard)/admin/surveys/survey-templates-view";
import { SurveysClient } from "@/app/(dashboard)/surveys/surveys-client";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const templates = [
  {
    id: "template-1",
    name: "Post-workshop feedback",
    description: "Measure workshop outcomes.",
    surveyType: "POST_WORKSHOP",
    isActive: true,
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    questions: [{ id: "question-1" }],
    _count: { surveys: 12 },
  },
];

it("preserves the survey template table DOM and actions when responsive mode is disabled", () => {
  render(<SurveyTemplatesView templates={templates} />);

  expect(screen.queryByRole("list", { name: "Survey templates" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("table").parentElement).toHaveAttribute("class", "overflow-x-auto");
  expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "href",
    "/admin/surveys/templates/template-1",
  );
  expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
    "class",
    "text-sm font-medium text-destructive hover:text-destructive/80 disabled:opacity-50",
  );
});

it("renders real survey template metadata and actions in compact records", () => {
  render(<SurveyTemplatesView templates={templates} responsiveEnabled />);

  const list = screen.getByRole("list", { name: "Survey templates" });
  expect(list).toHaveTextContent("Post-workshop feedback");
  expect(list).toHaveTextContent("Post-Workshop");
  expect(list).toHaveTextContent("Active");
  expect(list).toHaveTextContent("12");
  expect(list).toHaveTextContent("Aug 12, 2026");

  const open = within(list).getByRole("link", { name: "Open template" });
  expect(open).toHaveAttribute("href", "/admin/surveys/templates/template-1");
  expect(open).toHaveClass("min-h-11");

  fireEvent.keyDown(
    within(list).getByRole("button", { name: "More actions for Post-workshop feedback" }),
    { key: "ArrowDown" },
  );
  expect(screen.getByRole("menuitem", { name: "Results" })).toHaveAttribute(
    "href",
    "/admin/surveys/templates/template-1?tab=results",
  );
  expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("min-h-11");
});

const surveyPayload = {
  workshops: [{ id: "workshop-1", title: "Growth Workshop", eventDate: "2026-09-01T00:00:00.000Z" }],
  workflowConfigs: [{
    workshopId: "workshop-1",
    workshopTitle: "Growth Workshop",
    eventDate: "2026-09-01T00:00:00.000Z",
    preSurveyFormId: "pre-123",
    postSurveyFormId: "post-456",
    npsSurveyFormId: "nps-789",
    isActive: true,
    updatedAt: "2026-08-12T00:00:00.000Z",
  }],
  trends: [{
    workshopId: "workshop-1",
    workshopTitle: "Growth Workshop",
    eventDate: "2026-09-01T00:00:00.000Z",
    responses: 8,
    completed: 6,
    avgNps: 9,
  }],
  responses: [{
    id: "survey-1",
    surveyType: "POST_WORKSHOP",
    workshopId: "workshop-1",
    workshopTitle: "Growth Workshop",
    sentAt: "2026-08-10T00:00:00.000Z",
    completedAt: "2026-08-12T00:00:00.000Z",
    npsScore: 9,
  }],
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({ success: true, data: surveyPayload }),
  }) as unknown as typeof fetch;
});

it("preserves legacy workflow tables when responsive mode is disabled", async () => {
  render(<SurveysClient />);
  await screen.findByText("Configured Event Workflows");

  expect(screen.queryByRole("list", { name: "Configured survey workflows" })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Survey responses" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Pre-Event Survey ID").parentElement?.parentElement).toHaveAttribute(
    "class",
    "grid grid-cols-1 gap-4 md:grid-cols-3",
  );
  expect(screen.getByRole("button", { name: "Save Workflow" })).not.toHaveClass("min-h-11");
  expect(document.querySelectorAll("div.overflow-x-auto")).toHaveLength(3);
});

it("reflows workflow, trend, and response collections without losing fields or save", async () => {
  render(<SurveysClient responsiveEnabled />);

  const workflows = await screen.findByRole("list", { name: "Configured survey workflows" });
  expect(workflows).toHaveTextContent("Growth Workshop");
  expect(workflows).toHaveTextContent("Active");
  expect(workflows).toHaveTextContent("pre-123");
  expect(workflows).toHaveTextContent("post-456");
  expect(workflows).toHaveTextContent("nps-789");
  expect(workflows).toHaveTextContent("Updated Aug 12, 2026");

  const trends = screen.getByRole("list", { name: "Workshop survey trends" });
  expect(trends).toHaveTextContent("8");
  expect(trends).toHaveTextContent("6");
  expect(trends).toHaveTextContent("9");

  const responses = screen.getByRole("list", { name: "Survey responses" });
  expect(responses).toHaveTextContent("Post-Event");
  expect(responses).toHaveTextContent("Growth Workshop");
  expect(responses).toHaveTextContent("Completed");
  expect(responses).toHaveTextContent("9");

  expect(screen.getByRole("button", { name: "Save Workflow" })).toHaveClass("min-h-11");
  expect(screen.getByLabelText("Workshop")).toHaveClass("min-h-11 min-w-0");
  expect(screen.getByRole("region", { name: "Configured survey workflows table" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Workshop survey trends table" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Survey responses table" })).toBeInTheDocument();

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/surveys/workflows"));
});
