/**
 * ED6 Task 8 — cross-section move (select) + add-below-focused + drag wiring.
 * Within-section drag REORDER decision is covered by outline-drop.test.ts (8) +
 * the pattern being identical to EditorOutline (parity-tested); jsdom can't drive
 * a real dnd-kit pointer drag, so here we assert the drag handles are wired and
 * exercise the reliable move-select + add-below paths E2E through the controller.
 */
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
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
      sections: [
        { stableKey: "S1", name: "Financials" },
        { stableKey: "S2", name: "People" },
      ],
      questions: [
        { stableKey: "S1_rev", sectionStableKey: "S1", label: "Revenue", type: "NUMBER", isRequired: false, sortOrder: 1 },
        { stableKey: "S1_mgn", sectionStableKey: "S1", label: "Margin", type: "NUMBER", isRequired: false, sortOrder: 2 },
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

function cardCount(sectionTestId: string): number {
  return within(screen.getByTestId(sectionTestId)).queryAllByTestId(
    (id) => id.startsWith("question-card-"),
  ).length;
}

describe("SingleColumnFormBuilder — move + add-below + drag wiring (ED6 T8)", () => {
  it("each card carries a drag handle (reorder mechanism wired)", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    expect(document.querySelectorAll('[data-testid^="drag-handle-"]').length).toBe(2);
  });

  it("the move-to-section select relocates a question to the chosen section", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    expect(cardCount("sc-section-S1")).toBe(2);
    expect(cardCount("sc-section-S2")).toBe(0);

    const revenueCard = screen.getByText("Revenue").closest('[data-testid^="question-card-"]')!;
    const moveSelect = revenueCard.querySelector('[data-testid^="card-move-"]') as HTMLSelectElement;
    fireEvent.change(moveSelect, { target: { value: "S2" } });

    expect(within(screen.getByTestId("sc-section-S2")).getByText("Revenue")).toBeInTheDocument();
    expect(cardCount("sc-section-S1")).toBe(1);
    expect(cardCount("sc-section-S2")).toBe(1);
  });

  it("'+ Add question below' inserts a new question after the focused card", () => {
    render(<TemplateEditorTabbed {...baseProps()} />);
    expect(cardCount("sc-section-S1")).toBe(2);

    fireEvent.click(screen.getByText("Revenue"));
    const addBelow = document.querySelector('[data-testid^="sc-add-below-"]') as HTMLButtonElement;
    expect(addBelow).not.toBeNull();
    fireEvent.click(addBelow);

    expect(cardCount("sc-section-S1")).toBe(3);
  });
});
