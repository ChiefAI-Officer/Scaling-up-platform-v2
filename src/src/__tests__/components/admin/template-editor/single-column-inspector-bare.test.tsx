/**
 * ED6 Task 10 — QuestionInspector `bare` prop. Default (false) is byte-identical
 * to today (own `wf-card` section + "Edit Question —" header); `bare` drops both
 * so it sits flush inside a single-column card. The `questions-config-form` testid
 * stays in both modes.
 */
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { QuestionInspector } from "@/components/admin/template-editor/QuestionInspector";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

afterEach(() => cleanup());

const question = {
  uid: "u1",
  stableKey: "S1_Q",
  sectionStableKey: "S1",
  label: "How confident?",
  helpText: "",
  isRequired: true,
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
} as QuestionDraftRow;

function renderInspector(bare: boolean) {
  return render(
    <QuestionInspector
      question={question}
      isReadOnly={false}
      isUnlocked
      findingsEnabled
      conditionalEnabled
      showIfGates={[]}
      showIfDependents={[]}
      onClearDependents={() => {}}
      publishedOptionKeys={{}}
      onUpdate={() => {}}
      bare={bare}
    />,
  );
}

describe("QuestionInspector bare prop (ED6 T10)", () => {
  it("default (not bare) renders the wf-card chrome + 'Edit Question' header", () => {
    renderInspector(false);
    expect(screen.getByText(/Edit Question —/)).toBeInTheDocument();
    expect(screen.getByTestId("questions-config-form").className).toContain("wf-card");
  });

  it("bare drops the header AND the wf-card chrome, keeping the testid + fields", () => {
    renderInspector(true);
    expect(screen.queryByText(/Edit Question —/)).not.toBeInTheDocument();
    const form = screen.getByTestId("questions-config-form");
    expect(form.className).not.toContain("wf-card");
    // Fields still render (the stableKey field is always present).
    expect(screen.getByText("stableKey")).toBeInTheDocument();
  });
});
