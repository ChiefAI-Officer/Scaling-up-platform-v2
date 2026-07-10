import { render, screen, fireEvent } from "@testing-library/react";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

const sections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "Section 1", sortOrder: 1 } as unknown as SectionDraft,
];
const questions: QuestionDraftRow[] = [
  { uid: "u-q1", stableKey: "S1_q1", sectionStableKey: "S1", label: "How ready?", helpText: "",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, anchorMin: "Low", anchorMax: "High",
    options: [], findingBands: [], findingOptionTexts: {},
    showIf: null } as unknown as QuestionDraftRow,
];
// Real ScoringConfig shape (TierSchema uses minMetric/maxMetric/message + passThreshold).
const validScoringConfig = {
  tierMetric: "overallAvg",
  passThreshold: 0,
  tiers: [{ minMetric: 0, maxMetric: 3, label: "All", message: "ok" }],
};

const baseProps = {
  open: true,
  onClose: jest.fn(),
  templateAlias: "scaling-up-full",
  questions,
  sections,
  rawQuestions: [],
  rawSections: [],
  scoringConfig: validScoringConfig,
  publishedKeys: new Set<string>(),
  publishedOptionKeys: {},
  dirty: { questions: true, sections: true },
};

describe("TestModeDrawer", () => {
  it("renders the visible draft question via the real widget", () => {
    render(<TestModeDrawer {...baseProps} />);
    expect(screen.getByText("How ready?")).toBeInTheDocument();
  });

  it("shows the neutral empty state before any answer (scorer not called → no EMPTY_ANSWERS crash)", () => {
    render(<TestModeDrawer {...baseProps} />);
    expect(screen.getByText(/answer some questions to see results/i)).toBeInTheDocument();
  });

  it("shows a 'fix these' state when the draft's scoringConfig can't be scored", () => {
    // Empty scoringConfig fails the scoring schema (ScoringConfigBase requires
    // tiers/tierMetric/passThreshold) → config-error at parse time.
    render(<TestModeDrawer {...baseProps} scoringConfig={{}} />);
    expect(screen.getByText(/can't test yet/i)).toBeInTheDocument();
  });

  it("renders the scored result after answering (full pipeline, ResultPanel fields)", () => {
    render(<TestModeDrawer {...baseProps} />);
    // The real slider widget renders tap-to-set buttons labelled "Set rating to N".
    fireEvent.click(screen.getByLabelText("Set rating to 3"));
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByText(/Section 1:/)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(<TestModeDrawer {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("clearing a NUMBER field does not crash — treated as unanswered (review F1)", () => {
    const withNumber: QuestionDraftRow[] = [
      ...questions,
      { uid: "u-q2", stableKey: "S1_q2", sectionStableKey: "S1", label: "How many?", helpText: "",
        type: "NUMBER", isRequired: false, sortOrder: 2, isNewToDraft: false, isInherited: false,
        scaleMin: 0, scaleMax: 0, scaleStep: 1, anchorMin: "", anchorMax: "",
        options: [], findingBands: [], findingOptionTexts: {},
        showIf: null } as unknown as QuestionDraftRow,
    ];
    render(<TestModeDrawer {...baseProps} questions={withNumber} />);
    fireEvent.click(screen.getByLabelText("Set rating to 3")); // answer the slider
    const numInput = screen.getByRole("spinbutton"); // the NUMBER <input>
    fireEvent.change(numInput, { target: { value: "5" } });
    fireEvent.change(numInput, { target: { value: "" } }); // clear it — must NOT crash
    // Blank NUMBER = unanswered → the slider result still renders (no INVALID_TYPE crash).
    expect(screen.getByText("Sections")).toBeInTheDocument();
  });
});
