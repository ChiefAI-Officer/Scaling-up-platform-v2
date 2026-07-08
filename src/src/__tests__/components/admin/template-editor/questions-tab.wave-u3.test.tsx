/**
 * Wave U3 (spec 19aa D7) — the FindingsPanel test-a-value preview.
 *
 * Renders inside the (flag-gated) Findings panel. Uses the real respondent
 * widget (QuestionInput) and shows which finding fires, computed from the same
 * rules a save emits. Pins: preview exists when the panel is open; the
 * no-answer case shows the explicit hint; MULTI_CHOICE fires in authored option
 * order regardless of tick order; the slider carries the per-row note.
 */
import React from "react";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";

import {
  QuestionsTab,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterEach(() => {
  cleanup();
});

const sections: SectionDraft[] = [
  { uid: "sec1", stableKey: "S1_strategy", name: "Strategy" },
];

function makeQuestion(overrides: Partial<QuestionDraft>): QuestionDraft {
  return {
    uid: "q1",
    stableKey: "S1_q1",
    sectionStableKey: "S1_strategy",
    label: "How aligned is the team?",
    helpText: "",
    isRequired: false,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  };
}

function renderTab(question: QuestionDraft) {
  return render(
    <QuestionsTab
      sections={sections}
      questions={[question]}
      onAddQuestion={jest.fn()}
      onUpdateQuestion={jest.fn()}
      onDeleteQuestion={jest.fn()}
      onDuplicateQuestion={jest.fn()}
      onReorderQuestions={jest.fn()}
      isReadOnly={false}
      isUnlocked={true}
      publishedOptionKeys={{}}
      findingsEnabled={true}
    />,
  );
}

function openPanel() {
  fireEvent.click(screen.getByTestId("q-findings-toggle"));
}

describe("FindingsPreview", () => {
  it("appears when the panel is open and shows the no-answer hint", () => {
    renderTab(
      makeQuestion({
        findingBands: [{ minScore: 0, maxScore: 3, text: "Low band text" }],
      }),
    );
    expect(screen.queryByTestId("q-findings-preview")).toBeNull();
    openPanel();
    const preview = screen.getByTestId("q-findings-preview");
    expect(preview).toBeInTheDocument();
    expect(
      within(preview).getByTestId("q-findings-preview-result").textContent,
    ).toMatch(/Enter a sample answer/i);
  });

  it("SLIDER carries the per-row note", () => {
    renderTab(makeQuestion({ type: "SLIDER_LIKERT" }));
    openPanel();
    const preview = screen.getByTestId("q-findings-preview");
    expect(preview.textContent).toMatch(/slider recommendations via the per-row/i);
  });

  it("MULTI_CHOICE fires in authored option order regardless of tick order", () => {
    renderTab(
      makeQuestion({
        type: "MULTI_CHOICE",
        options: [
          { key: "a", label: "Alpha", isNew: false },
          { key: "b", label: "Bravo", isNew: false },
          { key: "c", label: "Charlie", isNew: false },
        ],
        findingOptionTexts: { a: "A note", c: "C note" },
      }),
    );
    openPanel();
    const preview = screen.getByTestId("q-findings-preview");
    // Tick Charlie THEN Alpha (out of authored order).
    fireEvent.click(within(preview).getByRole("checkbox", { name: "Charlie" }));
    fireEvent.click(within(preview).getByRole("checkbox", { name: "Alpha" }));
    const result = within(preview).getByTestId("q-findings-preview-result");
    const items = within(result)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("A note");
    expect(items[1]).toContain("C note");
  });

  it("MULTI_CHOICE with no rule for the picked option shows the no-fire message", () => {
    renderTab(
      makeQuestion({
        type: "MULTI_CHOICE",
        options: [
          { key: "a", label: "Alpha", isNew: false },
          { key: "b", label: "Bravo", isNew: false },
        ],
        findingOptionTexts: { a: "A note" },
      }),
    );
    openPanel();
    const preview = screen.getByTestId("q-findings-preview");
    fireEvent.click(within(preview).getByRole("checkbox", { name: "Bravo" }));
    expect(
      within(preview).getByTestId("q-findings-preview-result").textContent,
    ).toMatch(/No finding fires/i);
  });
});
