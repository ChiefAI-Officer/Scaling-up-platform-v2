/**
 * ED6 Task 11 — the expanded (focused) card body: live preview (QuestionCanvas,
 * reused verbatim with its collision-free "canvas-q-" prefix) + the bare
 * QuestionInspector. Only the focused card mounts an inspector; editing its label
 * round-trips through the model to the collapsed summary.
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (k: string) => mockSearchParams.get(k),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));
let mockUidCounter = 0;
jest.mock("@/components/admin/template-editor/sections-serialization", () => {
  const actual = jest.requireActual(
    "@/components/admin/template-editor/sections-serialization",
  );
  return { ...actual, genUid: jest.fn(() => `uid-${++mockUidCounter}`) };
});
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});
beforeEach(() => {
  toastMock.mockClear();
  mockSearchParams = new URLSearchParams("");
  mockUidCounter = 0;
});
afterEach(() => cleanup());

function baseProps() {
  return {
    template: {
      id: "tpl_1",
      name: "Alpha",
      alias: "ALPHA",
      aggregationMode: "FULL_VISIBILITY" as const,
      accessMode: "INVITED" as const,
    },
    version: {
      id: "ver_2",
      versionNumber: 2,
      language: "en-US",
      publishedAt: null,
      contentHash: "abcdef012345",
      sections: [{ stableKey: "S1", name: "Financials" }],
      questions: [
        {
          stableKey: "S1_rev",
          sectionStableKey: "S1",
          label: "Revenue",
          type: "SLIDER_LIKERT",
          isRequired: true,
          sortOrder: 1,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
        {
          stableKey: "S1_mgn",
          sectionStableKey: "S1",
          label: "Margin",
          type: "SLIDER_LIKERT",
          isRequired: false,
          sortOrder: 2,
          scale: { min: 0, max: 10, step: 1, anchorMin: "Low", anchorMax: "High" },
        },
      ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: [
      { id: "ver_2", versionNumber: 2, language: "en-US", publishedAt: null, contentHash: "abcdef012345" },
    ],
    publishedQuestionKeys: [] as string[],
    publishedOptionKeys: {} as Record<string, string[]>,
    waveQEnabled: true,
    questionEditorUnlocked: true,
    findingsEnabled: true,
    conditionalAuthoringEnabled: true,
    testModeEnabled: true,
    safeToPublishEnabled: true,
    singleColumnEnabled: true,
  };
}

describe("Expanded card — preview + bare inspector (ED6 T11)", () => {
  it("focusing a card mounts the preview + the BARE inspector (no wf-card / no header)", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    fireEvent.click(screen.getByText("Revenue"));

    expect(screen.getByTestId("question-canvas")).toBeInTheDocument();
    const form = screen.getByTestId("questions-config-form");
    expect(form.className).not.toContain("wf-card"); // bare
    expect(screen.queryByText(/Edit Question —/)).not.toBeInTheDocument();
  });

  it("only the focused card mounts an inspector", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    expect(screen.queryAllByTestId("questions-config-form").length).toBe(0);
    fireEvent.click(screen.getByText("Revenue"));
    expect(screen.queryAllByTestId("questions-config-form").length).toBe(1);
  });

  it("editing the label in the inspector updates the collapsed summary (round-trip via model)", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    fireEvent.click(screen.getByText("Revenue"));
    const labelField = screen.getByDisplayValue("Revenue");
    fireEvent.change(labelField, { target: { value: "Total revenue" } });
    // The focus BUTTON (collapsed summary) reflects the new label. Query by role —
    // the live preview also shows the label, so getByText would be ambiguous.
    expect(
      screen.getByRole("button", { name: "Total revenue" }),
    ).toBeInTheDocument();
  });
});
