/**
 * Wave 11-G: Workflow editor survey picker shows inactive templates with "(inactive)" suffix
 *
 * The picker now receives all templates (active and inactive) from the API
 * and labels inactive ones with "(inactive)" suffix so admins can still pin them
 * to workflow steps while understanding their status.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

jest.mock("@/components/workflows/workflow-timeline", () => ({
  WorkflowTimeline: () => <div data-testid="wf-timeline" />,
}));
jest.mock("@/components/workflows/workflow-executions", () => ({
  WorkflowExecutions: () => <div data-testid="wf-executions" />,
}));

import { WorkflowEditor } from "@/components/workflows/workflow-editor";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-1",
    workflowId: "wf-1",
    sortOrder: 0,
    stepType: "SEND_SURVEY_LINK",
    emailTemplateId: null,
    subject: null,
    body: null,
    customRecipients: null,
    triggerType: "RELATIVE_TO_EVENT",
    offsetDays: -1,
    offsetHours: null,
    sendTimeOfDay: "09:00",
    attachments: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    emailTemplate: null,
    surveyTemplateId: null,
    ...overrides,
  };
}

function makeWorkflow(steps: ReturnType<typeof makeStep>[] = []) {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: null,
    isActive: true,
    isTemplate: false,
    categoryId: null,
    workshopFormat: null,
    workflowPhase: null,
    createdBy: "admin",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps,
    assignments: [],
  };
}

function renderWithSurveyStep(surveyTemplates: { id: string; name: string; isActive: boolean }[]) {
  // Mock fetch: survey-templates returns the given templates; files return empty
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/survey-templates")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: surveyTemplates }),
      });
    }
    if (typeof url === "string" && url.includes("/api/files")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: {} }),
    });
  });

  const step = makeStep({ stepType: "SEND_SURVEY_LINK" });
  const workflow = makeWorkflow([step]);

  render(
    <WorkflowEditor
      workflow={workflow}
      emailTemplates={[]}
      workshops={[]}
      categories={[]}
      isNew={false}
    />
  );

  // Click Edit to open the StepCard editing mode
  const editBtn = screen.getByRole("button", { name: /^edit$/i });
  fireEvent.click(editBtn);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Test 1: active + inactive templates both appear; inactive has suffix ──────

it("renders both active and inactive templates, labelling inactive with (inactive)", async () => {
  renderWithSurveyStep([
    { id: "tmpl-active", name: "Active Survey", isActive: true },
    { id: "tmpl-inactive", name: "Old Survey", isActive: false },
  ]);

  // Both options should appear in the select
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Active Survey" })).toBeInTheDocument();
  });

  expect(screen.getByRole("option", { name: "Old Survey (inactive)" })).toBeInTheDocument();

  // Active option should NOT have the suffix
  const activeOption = screen.getByRole("option", { name: "Active Survey" });
  expect(activeOption.textContent).toBe("Active Survey");
});

// ── Test 2: all templates inactive — picker still renders them ────────────────

it("renders all templates when all are inactive — no empty state shown", async () => {
  renderWithSurveyStep([
    { id: "tmpl-1", name: "Retired Survey A", isActive: false },
    { id: "tmpl-2", name: "Retired Survey B", isActive: false },
  ]);

  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Retired Survey A (inactive)" })).toBeInTheDocument();
  });

  expect(screen.getByRole("option", { name: "Retired Survey B (inactive)" })).toBeInTheDocument();

  // Empty state "No survey templates" must NOT be visible
  expect(screen.queryByText(/no survey templates/i)).not.toBeInTheDocument();
});
