/**
 * ED6 Task 7 — SingleColumnFormBuilder shell: section bands + collapsed cards +
 * focus + empty states. Rendered through TemplateEditorTabbed (real model), flag
 * ON. Same harness as single-column-flag.test.tsx.
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { TemplateEditorTabbed } from "@/components/admin/TemplateEditorTabbed";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
const replaceMock = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, refresh: jest.fn() }),
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

const allVersionsMeta = [
  { id: "ver_2", versionNumber: 2, language: "en-US", publishedAt: null, contentHash: "abcdef012345" },
];

function props(over: {
  sections?: { stableKey: string; name: string }[];
  questions?: Record<string, unknown>[];
}) {
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
      sections: over.sections ?? [
        { stableKey: "S1", name: "Financials" },
        { stableKey: "S2", name: "People" },
      ],
      questions:
        over.questions ??
        [
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
            stableKey: "S1_margin",
            sectionStableKey: "S1",
            label: "Margin",
            type: "NUMBER",
            isRequired: false,
            sortOrder: 2,
          },
        ],
      scoringConfig: {},
      reportConfig: null,
    },
    allVersions: allVersionsMeta,
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

describe("SingleColumnFormBuilder (ED6 T7)", () => {
  it("renders a band per section with a card per question", () => {
    render(<TemplateEditorTabbed {...props({})} />);
    expect(screen.getByTestId("sc-section-S1")).toBeInTheDocument();
    expect(screen.getByTestId("sc-section-S2")).toBeInTheDocument();
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Margin")).toBeInTheDocument();
    const cards = document.querySelectorAll('[data-testid^="question-card-"]');
    expect(cards.length).toBe(2);
  });

  it("shows the Required badge only on required questions", () => {
    render(<TemplateEditorTabbed {...props({})} />);
    const revenueCard = screen
      .getByText("Revenue")
      .closest('[data-testid^="question-card-"]')!;
    const marginCard = screen
      .getByText("Margin")
      .closest('[data-testid^="question-card-"]')!;
    expect(revenueCard.querySelector('[data-testid="card-badge-required"]')).not.toBeNull();
    expect(marginCard.querySelector('[data-testid="card-badge-required"]')).toBeNull();
  });

  it("clicking a card focuses it (aria-current) and reveals its expanded body slot", () => {
    render(<TemplateEditorTabbed {...props({})} />);
    fireEvent.click(screen.getByText("Revenue"));
    const revenueCard = screen
      .getByText("Revenue")
      .closest('[data-testid^="question-card-"]')!;
    expect(revenueCard).toHaveAttribute("aria-current", "true");
    expect(document.querySelector('[data-testid^="card-body-"]')).not.toBeNull();
  });

  it("collapsing a section hides its cards", () => {
    render(<TemplateEditorTabbed {...props({})} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sc-section-toggle-S1"));
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
  });

  it("an empty section shows the dashed add-question zone", () => {
    render(<TemplateEditorTabbed {...props({})} />);
    // S2 has no questions in the default fixture.
    expect(screen.getByTestId("sc-section-empty-S2")).toBeInTheDocument();
    expect(screen.getByTestId("sc-add-question-S2")).toBeInTheDocument();
  });

  it("an empty instrument (no sections) shows the add-first-section CTA", () => {
    render(<TemplateEditorTabbed {...props({ sections: [], questions: [] })} />);
    expect(screen.getByTestId("single-column-empty")).toBeInTheDocument();
    expect(screen.getByTestId("single-column-add-first-section")).toBeInTheDocument();
  });
});
