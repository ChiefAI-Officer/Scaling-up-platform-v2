/**
 * ED4 Task 5 — QuestionCanvas (center in-context preview) tests.
 *
 * Proves: renders respondent chrome for the focused question; empty state when
 * nothing is focused; the local throwaway-state INVARIANT (co-validate C4 —
 * interaction stays local, the component has no mutation prop so it structurally
 * cannot dirty the model; a fresh mount is unanswered, which is how the parent's
 * `key={uid}` resets it on focus change); and the DISTINCT id namespace
 * ("canvas-q-") so it never collides with a default-prefix ("q-") widget for the
 * same question (co-validate C5).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestionCanvas } from "@/components/admin/template-editor/QuestionCanvas";
import { QuestionInput } from "@/components/assessments/question-input";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

function sliderQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u-1",
    stableKey: "S1_Q1",
    sectionStableKey: "S1",
    label: "How aligned is the team?",
    helpText: "Consider the last quarter.",
    isRequired: true,
    type: "SLIDER_LIKERT",
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Not at all",
    anchorMax: "Completely",
    options: [],
    maxChoices: null,
    recommendations: [],
    showIf: null,
    sortOrder: 0,
    // loosely-typed test fixture (babel-jest strips types); cast for any
    // fields the evolving QuestionDraftRow adds.
    ...overrides,
  } as QuestionDraftRow;
}

describe("QuestionCanvas", () => {
  it("shows the empty state when nothing is focused", () => {
    render(<QuestionCanvas question={null} sectionName={null} />);
    expect(screen.getByTestId("question-canvas-empty")).toBeInTheDocument();
    expect(screen.getByText("Select a question to preview it.")).toBeInTheDocument();
    expect(screen.queryByTestId("question-canvas")).not.toBeInTheDocument();
  });

  it("renders the focused question's respondent chrome (section, label, required, help, widget)", () => {
    render(
      <QuestionCanvas question={sliderQuestion()} sectionName="Section One" />,
    );
    expect(screen.getByTestId("question-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("question-canvas-section")).toHaveTextContent(
      "Section One",
    );
    expect(
      screen.getByText("How aligned is the team?"),
    ).toBeInTheDocument();
    // required marker
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(
      screen.getByText("Consider the last quarter."),
    ).toBeInTheDocument();
    // the real respondent widget (range input → role slider)
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("uses the distinct 'canvas-q-' id namespace so it can't collide with a default 'q-' widget (C5)", () => {
    const q = sliderQuestion();
    const { container } = render(
      <>
        <QuestionCanvas question={q} sectionName={null} />
        {/* A second widget for the SAME question at the DEFAULT prefix — as the
            inspector's FindingsPreview renders it. Ids must not collide. */}
        <QuestionInput
          question={{
            stableKey: q.stableKey,
            type: q.type,
            label: q.label,
            isRequired: false,
            scale: {
              min: 0,
              max: 10,
              step: 1,
              anchorMin: "a",
              anchorMax: "b",
            },
          }}
          value={undefined}
          onChange={() => {}}
        />
      </>,
    );
    expect(container.querySelector("#canvas-q-S1_Q1")).not.toBeNull();
    expect(container.querySelector("#q-S1_Q1")).not.toBeNull();
    // No duplicate ids anywhere.
    const ids = Array.from(container.querySelectorAll("[id]")).map(
      (el) => el.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is interactive with purely local state and has no mutation prop (invariant, C4)", () => {
    render(<QuestionCanvas question={sliderQuestion()} sectionName={null} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    // Fresh mount is unanswered — this is how the parent's key={uid} reset works.
    expect(slider.getAttribute("aria-valuenow")).toBeNull();
    // Interacting updates ONLY local display state.
    fireEvent.change(slider, { target: { value: "7" } });
    expect(slider.value).toBe("7");
    expect(slider.getAttribute("aria-valuenow")).toBe("7");
    // QuestionCanvas exposes NO model/mutation/onUpdate/onSave prop — it
    // structurally cannot dirty the model. (Type-enforced; asserted here by the
    // absence of any callback surface: the only props are question + sectionName.)
  });

  it("shows a muted 'Preview only' note next to the widget (B-4)", () => {
    render(
      <QuestionCanvas question={sliderQuestion()} sectionName="Section One" />,
    );
    const note = screen.getByTestId("question-canvas-preview-note");
    expect(note).toHaveTextContent(/preview only/i);
    expect(note).toHaveTextContent(/answers here/i);
  });

  it("does NOT show the preview-only note in the empty state", () => {
    render(<QuestionCanvas question={null} sectionName={null} />);
    expect(
      screen.queryByTestId("question-canvas-preview-note"),
    ).not.toBeInTheDocument();
  });

  it("re-mounting (as the parent does on focus change) starts unanswered again", () => {
    const { rerender } = render(
      <QuestionCanvas
        key="u-1"
        question={sliderQuestion()}
        sectionName={null}
      />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("5");
    // Parent remounts with a new key on focus change → local state resets.
    rerender(
      <QuestionCanvas
        key="u-2"
        question={sliderQuestion({ uid: "u-2", stableKey: "S1_Q2" })}
        sectionName={null}
      />,
    );
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.getAttribute("aria-valuenow")).toBeNull();
  });
});
