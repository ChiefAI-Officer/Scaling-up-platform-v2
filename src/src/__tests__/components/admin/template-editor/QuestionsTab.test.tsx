/**
 * F3 — QuestionsTab (Checkpoint 2).
 *
 * Tests written FIRST per TDD discipline (red phase). Wireframe spec:
 * src/public/wireframes-phase2/admin/17-admin-template-editor-questions.html
 *
 * Layout: 3-column grid
 *   - LEFT (20%, sticky): Section navigator
 *   - MIDDLE (50%): Question list for the selected section (drag-sortable)
 *   - RIGHT (30%, sticky): Per-question config form
 *
 * Below the grid: v1.5 informational cards (TEXT / TEXTAREA / COMPOUND).
 *
 * Plan ref: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F3 +
 * Gap E + grill Q8 + grill Q9).
 */

import React from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

// ────────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const replaceMock = jest.fn();
const refreshMock = jest.fn();
const pushMock = jest.fn();

let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams.get(key),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));

const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});

beforeEach(() => {
  toastMock.mockClear();
  replaceMock.mockClear();
  refreshMock.mockClear();
  pushMock.mockClear();
  (window.confirm as jest.Mock).mockClear?.();
  mockSearchParams = new URLSearchParams("tab=questions");
});

afterEach(() => {
  cleanup();
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const baseTemplate = {
  id: "tpl_1",
  name: "Rockefeller Habits Checklist",
  alias: "RockHabits",
  description: "Description",
  invitationSubject: "subject",
  invitationBodyMarkdown: "body",
  resultsEmailSubject: null as string | null,
  resultsEmailBodyMarkdown: null as string | null,
  resultsEmailContentApproved: false,
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

const sectionsFixture = [
  { stableKey: "S1", name: "Section 1 — Strategy", description: "" },
  { stableKey: "S2", name: "Section 2 — Execution", description: "" },
];

const questionsFixture = [
  {
    stableKey: "Q1_1",
    sectionStableKey: "S1",
    label: "S1 Q1 label",
    type: "SLIDER_LIKERT",
    isRequired: true,
    sortOrder: 1,
    scale: { min: 0, max: 3, step: 1, anchorMin: "Not true", anchorMax: "Very true" },
  },
  {
    stableKey: "Q2_1",
    sectionStableKey: "S2",
    label: "The Critical Number is identified to move the company ahead this quarter.",
    type: "SLIDER_LIKERT",
    isRequired: true,
    sortOrder: 1,
    scale: { min: 0, max: 3, step: 1, anchorMin: "Not true", anchorMax: "Completely true" },
  },
  {
    stableKey: "Q2_2",
    sectionStableKey: "S2",
    label: "3–5 Priorities (Rocks) ranked for the quarter.",
    type: "SLIDER_LIKERT",
    isRequired: true,
    sortOrder: 2,
    scale: { min: 0, max: 3, step: 1, anchorMin: "Not true", anchorMax: "Completely true" },
  },
];

const draftVersion = {
  id: "ver_2",
  versionNumber: 2,
  language: "en-US",
  publishedAt: null,
  contentHash: "abcdef",
  questions: questionsFixture,
  sections: sectionsFixture,
  scoringConfig: { tierMetric: "overallAvg", passThreshold: 3, tiers: [] },
  reportConfig: null,
};

const publishedVersion = {
  ...draftVersion,
  id: "ver_1",
  versionNumber: 1,
  publishedAt: "2026-05-05T00:00:00.000Z",
};

const allVersions = [
  {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null,
  },
];

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────
describe("QuestionsTab — F3 (Checkpoint 2)", () => {
  it("renders the 3-column layout: navigator, question list, config form", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-questions");
    expect(within(panel).getByTestId("questions-section-nav")).toBeInTheDocument();
    expect(within(panel).getByTestId("questions-question-list")).toBeInTheDocument();
    expect(within(panel).getByTestId("questions-config-form")).toBeInTheDocument();
  });

  it("section navigator lists all sections with stableKey + name + completion count badge", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const nav = screen.getByTestId("questions-section-nav");
    // S1 row: 1 question (Q1_1)
    expect(within(nav).getByText("S1")).toBeInTheDocument();
    expect(within(nav).getByText(/Section 1 — Strategy/)).toBeInTheDocument();
    // S2 row: 2 questions (Q2_1, Q2_2)
    expect(within(nav).getByText("S2")).toBeInTheDocument();
    expect(within(nav).getByText(/Section 2 — Execution/)).toBeInTheDocument();
    // Counts: S1 has 1/1, S2 has 2/2 (all labels present)
    expect(within(nav).getByTestId("section-nav-count-S1")).toHaveTextContent(
      "1/1",
    );
    expect(within(nav).getByTestId("section-nav-count-S2")).toHaveTextContent(
      "2/2",
    );
  });

  it("first section is selected by default with aria-current=true", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const nav = screen.getByTestId("questions-section-nav");
    const s1Btn = within(nav).getByTestId("section-nav-item-S1");
    expect(s1Btn).toHaveAttribute("aria-current", "true");
  });

  it("clicking a section switches the middle column to that section's questions", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Start: S1 selected, only Q1_1 visible in middle column
    const list = screen.getByTestId("questions-question-list");
    expect(within(list).getByText("Q1_1")).toBeInTheDocument();
    expect(within(list).queryByText("Q2_1")).toBeNull();

    // Click S2 in nav
    const nav = screen.getByTestId("questions-section-nav");
    const s2Btn = within(nav).getByTestId("section-nav-item-S2");
    act(() => {
      fireEvent.click(s2Btn);
    });

    // Middle column now shows Q2_1 + Q2_2, not Q1_1
    expect(within(list).queryByText("Q1_1")).toBeNull();
    expect(within(list).getByText("Q2_1")).toBeInTheDocument();
    expect(within(list).getByText("Q2_2")).toBeInTheDocument();
    // aria-current moved
    expect(s2Btn).toHaveAttribute("aria-current", "true");
  });

  it("question cards show stableKey + SLIDER_LIKERT type pill + label + Edit/Duplicate/Delete", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2 for richer card content
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const list = screen.getByTestId("questions-question-list");
    const q2_1Card = within(list).getByTestId("question-card-Q2_1");
    expect(within(q2_1Card).getByText("Q2_1")).toBeInTheDocument();
    expect(within(q2_1Card).getByText("SLIDER_LIKERT")).toBeInTheDocument();
    expect(within(q2_1Card).getByText(/Critical Number is identified/)).toBeInTheDocument();
    expect(within(q2_1Card).getByRole("button", { name: /^Edit$/ })).toBeInTheDocument();
    expect(within(q2_1Card).getByRole("button", { name: /^Duplicate$/ })).toBeInTheDocument();
    expect(within(q2_1Card).getByRole("button", { name: /^Delete$/ })).toBeInTheDocument();
  });

  it("clicking a question card focuses it in the right column", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2 (which has 2 questions)
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const form = screen.getByTestId("questions-config-form");
    // First question in S2 (Q2_1) is auto-focused by default
    expect(within(form).getByText(/Edit Question — Q2_1/)).toBeInTheDocument();

    // Click Q2_2 to focus it
    const list = screen.getByTestId("questions-question-list");
    const q2_2Card = within(list).getByTestId("question-card-Q2_2");
    act(() => {
      fireEvent.click(within(q2_2Card).getByRole("button", { name: /^Edit$/ }));
    });

    expect(within(form).getByText(/Edit Question — Q2_2/)).toBeInTheDocument();
  });

  it("right column form shows stableKey read-only + Question Type select + Label + Help text + Required + Sort order", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");

    // stableKey read-only input
    const stableKeyInput = within(form).getByLabelText("stableKey");
    expect(stableKeyInput).toHaveAttribute("readonly");
    expect(stableKeyInput).toHaveValue("Q1_1");

    // Question Type select
    expect(within(form).getByLabelText("Question Type")).toBeInTheDocument();

    // Label textarea
    expect(within(form).getByLabelText("Label")).toBeInTheDocument();

    // Help text input
    expect(within(form).getByLabelText("Help text")).toBeInTheDocument();

    // Required toggle
    expect(within(form).getByLabelText(/^Required/)).toBeInTheDocument();

    // Sort order input
    expect(within(form).getByLabelText(/Sort order within section/)).toBeInTheDocument();
  });

  it("Question Type select has NUMBER and MULTI_CHOICE disabled with v1.5 markers (grill Q9)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    const select = within(form).getByLabelText("Question Type") as HTMLSelectElement;

    const options = Array.from(select.querySelectorAll("option"));
    const slider = options.find((o) => o.value === "SLIDER_LIKERT");
    const number = options.find((o) => o.value === "NUMBER");
    const multi = options.find((o) => o.value === "MULTI_CHOICE");
    const text = options.find((o) => o.value === "TEXT");
    const textarea = options.find((o) => o.value === "TEXTAREA");
    const compound = options.find((o) => o.value === "COMPOUND");

    expect(slider).toBeTruthy();
    expect(slider!.disabled).toBe(false);
    // NUMBER + MULTI_CHOICE disabled in v1 (Gap E + Q9 — defer all non-SLIDER types)
    expect(number).toBeTruthy();
    expect(number!.disabled).toBe(true);
    expect(multi).toBeTruthy();
    expect(multi!.disabled).toBe(true);
    // v1.5 group — all disabled
    expect(text!.disabled).toBe(true);
    expect(textarea!.disabled).toBe(true);
    expect(compound!.disabled).toBe(true);
  });

  it("SLIDER_LIKERT config block exposes Scale min/max/step + Anchor min/max", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    expect(within(form).getByLabelText("Scale min")).toBeInTheDocument();
    expect(within(form).getByLabelText("Scale max")).toBeInTheDocument();
    expect(within(form).getByLabelText("Scale step")).toBeInTheDocument();
    expect(within(form).getByLabelText("Anchor — min")).toBeInTheDocument();
    expect(within(form).getByLabelText("Anchor — max")).toBeInTheDocument();
  });

  it("editing Label flips questionsDirty (Save Draft enabled)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).toBeDisabled();

    const form = screen.getByTestId("questions-config-form");
    const labelTextarea = within(form).getByLabelText("Label");
    act(() => {
      fireEvent.change(labelTextarea, { target: { value: "New label" } });
    });

    expect(saveBtn).not.toBeDisabled();
  });

  it("toggling Required flips questionsDirty", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).toBeDisabled();

    const form = screen.getByTestId("questions-config-form");
    const requiredToggle = within(form).getByLabelText(/^Required/);
    act(() => {
      fireEvent.click(requiredToggle);
    });

    expect(saveBtn).not.toBeDisabled();
  });

  it("editing Scale min flips questionsDirty", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).toBeDisabled();

    const form = screen.getByTestId("questions-config-form");
    const scaleMin = within(form).getByLabelText("Scale min");
    act(() => {
      fireEvent.change(scaleMin, { target: { value: "1" } });
    });

    expect(saveBtn).not.toBeDisabled();
  });

  it("NUMBER accordion is collapsed by default with all inputs disabled (Gap E)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    const numberAccordion = within(form).getByTestId("number-accordion");
    expect(numberAccordion).toBeInTheDocument();

    // Inputs inside the NUMBER block exist but are disabled (v1.5 deferred)
    const inputs = numberAccordion.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it("MULTI_CHOICE accordion is collapsed by default with all inputs disabled (Gap E)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    const multiAccordion = within(form).getByTestId("multichoice-accordion");
    expect(multiAccordion).toBeInTheDocument();

    const inputs = multiAccordion.querySelectorAll("input, button");
    // At minimum some elements should exist and be disabled (or non-interactive)
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((el) => {
      // Allow the disclosure toggle to remain interactive
      if (el.getAttribute("data-disclosure-toggle") === "true") return;
      expect(el).toBeDisabled();
    });
  });

  it("v1.5 informational cards render below the grid (TEXT/TEXTAREA/COMPOUND)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-questions");
    const deferred = within(panel).getByTestId("v15-deferred-panel");
    expect(deferred).toBeInTheDocument();
    // 3 cards
    expect(within(deferred).getByText("TEXT")).toBeInTheDocument();
    expect(within(deferred).getByText("TEXTAREA")).toBeInTheDocument();
    expect(within(deferred).getByText("COMPOUND")).toBeInTheDocument();
    // Banner copy verbatim from WF17 — "These types ship in v1.5."
    expect(within(deferred).getByText(/ship in/i)).toBeInTheDocument();
  });

  it("v1.5 informational cards are not interactive (no inputs)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const panel = screen.getByTestId("tab-panel-questions");
    const deferred = within(panel).getByTestId("v15-deferred-panel");
    expect(deferred.querySelector("input")).toBeNull();
    expect(deferred.querySelector("textarea")).toBeNull();
    expect(deferred.querySelector("select")).toBeNull();
  });

  it("+ Add Question creates a new question with stableKey starting 'Q_NEW_' in the selected section", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2 (2 questions)
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const list = screen.getByTestId("questions-question-list");
    const addBtn = within(list).getByRole("button", { name: /^\+ Add Question$/ });
    act(() => {
      fireEvent.click(addBtn);
    });

    // A new card with stableKey starting Q_NEW_ should exist
    const allCards = within(list).getAllByTestId(/^question-card-/);
    const newCard = allCards.find((c) =>
      (c.getAttribute("data-testid") ?? "").includes("Q_NEW_"),
    );
    expect(newCard).toBeTruthy();

    // Save Draft enabled
    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    expect(saveBtn).not.toBeDisabled();
  });

  it("Delete removes the question after confirmation", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2 (2 questions)
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const list = screen.getByTestId("questions-question-list");
    const q2_2Card = within(list).getByTestId("question-card-Q2_2");
    const deleteBtn = within(q2_2Card).getByRole("button", { name: /^Delete$/ });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    // Q2_2 gone; Q2_1 remains
    expect(within(list).queryByTestId("question-card-Q2_2")).toBeNull();
    expect(within(list).getByTestId("question-card-Q2_1")).toBeInTheDocument();
  });

  it("Duplicate creates a Q_NEW_-stableKey copy of the question in the same section", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const list = screen.getByTestId("questions-question-list");
    const q2_1Card = within(list).getByTestId("question-card-Q2_1");
    const dupBtn = within(q2_1Card).getByRole("button", { name: /^Duplicate$/ });
    act(() => {
      fireEvent.click(dupBtn);
    });

    const allCards = within(list).getAllByTestId(/^question-card-/);
    const duplicate = allCards.find((c) =>
      (c.getAttribute("data-testid") ?? "").includes("Q_NEW_"),
    );
    expect(duplicate).toBeTruthy();
  });

  it("read-only mode disables all inputs across all 3 columns when version is published", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={publishedVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    // Label textarea disabled
    expect(within(form).getByLabelText("Label")).toBeDisabled();
    // Help text disabled
    expect(within(form).getByLabelText("Help text")).toBeDisabled();
    // Question Type select disabled
    expect(within(form).getByLabelText("Question Type")).toBeDisabled();
    // Sort order disabled
    expect(within(form).getByLabelText(/Sort order within section/)).toBeDisabled();
    // Scale inputs disabled
    expect(within(form).getByLabelText("Scale min")).toBeDisabled();

    const list = screen.getByTestId("questions-question-list");
    // Add Question disabled (hidden or disabled)
    const addBtn = within(list).queryByRole("button", { name: /^\+ Add Question$/ });
    if (addBtn) expect(addBtn).toBeDisabled();
  });

  it("editing Label persists via version PATCH on Save Draft", async () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    const fetchMock = jest.fn(async () =>
      makeJsonResponse({ success: true }, 200),
    ) as unknown as typeof fetch;
    global.fetch = fetchMock;

    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const form = screen.getByTestId("questions-config-form");
    const labelTextarea = within(form).getByLabelText("Label");
    act(() => {
      fireEvent.change(labelTextarea, { target: { value: "Updated S1 Q1" } });
    });

    const saveBtn = screen.getByRole("button", { name: /Save Draft/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      const calls = (fetchMock as unknown as jest.Mock).mock.calls;
      const urls = calls.map((c: unknown[]) => String(c[0]));
      expect(
        urls.some(
          (u: string) =>
            u.includes("/versions/ver_2") && !u.includes("/publish"),
        ),
      ).toBe(true);
    });

    // Verify the body sent contains the edited label
    const callIndex = (fetchMock as unknown as jest.Mock).mock.calls.findIndex(
      (c: unknown[]) =>
        String(c[0]).includes("/versions/ver_2") &&
        !String(c[0]).includes("/publish"),
    );
    const init = (fetchMock as unknown as jest.Mock).mock.calls[callIndex][1] as
      | RequestInit
      | undefined;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      questions?: Array<{ stableKey: string; label?: string }>;
    };
    const updated = body.questions?.find((q) => q.stableKey === "Q1_1");
    expect(updated?.label).toBe("Updated S1 Q1");
  });

  it("question cards have a drag handle (drag-sortable via @dnd-kit)", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    // Switch to S2
    const nav = screen.getByTestId("questions-section-nav");
    act(() => {
      fireEvent.click(within(nav).getByTestId("section-nav-item-S2"));
    });

    const list = screen.getByTestId("questions-question-list");
    const q2_1Card = within(list).getByTestId("question-card-Q2_1");
    const handle = within(q2_1Card).getByTestId(/drag-handle/);
    expect(handle).toBeInTheDocument();
  });

  it("footer caption mentions drag-to-reorder + sortOrder + stableKey immutability", () => {
    mockSearchParams = new URLSearchParams("tab=questions");
    render(
      <TemplateEditorTabbed
        template={baseTemplate}
        version={draftVersion}
        allVersions={allVersions}
      />,
    );

    const list = screen.getByTestId("questions-question-list");
    expect(within(list).getByText(/Drag rows to reorder/i)).toBeInTheDocument();
    expect(within(list).getByText(/sortOrder/i)).toBeInTheDocument();
    expect(within(list).getByText(/stableKey/i)).toBeInTheDocument();
  });
});
