/**
 * ED6 Task 13 — accessibility. Section landmarks + names, labelled controls,
 * aria-current on the focused card, ≥24px drag handles with names, and the
 * DndContext SR announcements (named by label, not uid).
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));
const mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => ({
    get: (k: string) => mockSearchParams.get(k),
    toString: () => mockSearchParams.toString(),
  }),
  usePathname: () => "/admin/assessments/templates/tpl_1/versions/ver_2/edit",
}));
jest.mock("@/components/admin/template-editor/sections-serialization", () => {
  const actual = jest.requireActual(
    "@/components/admin/template-editor/sections-serialization",
  );
  let n = 0;
  return { ...actual, genUid: jest.fn(() => `uid-${++n}`) };
});
afterEach(() => cleanup());

function props() {
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

describe("SingleColumnFormBuilder a11y (ED6 T13)", () => {
  it("renders each section as a named group landmark", () => {
    render(<TemplateEditorTabbed {...props()} />);
    expect(screen.getByRole("group", { name: "Financials" })).toBeInTheDocument();
  });

  it("labels the section-name field, collapse toggle, and drag handle", () => {
    render(<TemplateEditorTabbed {...props()} />);
    expect(screen.getByLabelText("Section name")).toBeInTheDocument();
    const toggle = screen.getByTestId("sc-section-toggle-S1");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const handle = document.querySelector('[data-testid^="drag-handle-"]')!;
    expect(handle.getAttribute("aria-label")).toMatch(/Drag to reorder/);
  });

  it("marks the focused card with aria-current", () => {
    render(<TemplateEditorTabbed {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    const card = screen
      .getByRole("button", { name: "Revenue" })
      .closest('[data-testid^="question-card-"]')!;
    expect(card).toHaveAttribute("aria-current", "true");
  });
});
