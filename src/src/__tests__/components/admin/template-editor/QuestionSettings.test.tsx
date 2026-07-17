/**
 * ED9 Task 4 (spec 19al-plan) — `QuestionSettings` contract.
 *
 * `QuestionSettings` is the per-type config BODY lifted verbatim out of
 * `QuestionInspector` (read-only fallback + slider settings + the Wave-T
 * TEXT/NUMBER/MULTI_CHOICE blocks) so ED9's Google-Forms question card can
 * compose the exact same surface. Rendered DOM byte-identity is pinned by
 * `ed9-golden-snapshots.test.tsx` (bare inspector); this file pins the
 * component's OWN contract in isolation: which block renders per type, that
 * the shared `actions` object is wired for scale + option-remove edits, and
 * that `isReadOnly` disables the inputs.
 *
 * NOTE on NUMBER — the flag-ON per-type config for NUMBER is the
 * `number-config-note` card (free numeric entry note); the min/max/decimals/
 * unit inputs the task brief mentions live ONLY in the flag-OFF legacy v1.5
 * accordions, which are NOT part of the per-type config body (they sit after
 * the Findings/ShowIf panels in the inspector and stay there). This suite
 * asserts the real extracted NUMBER surface.
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { QuestionSettings } from "@/components/admin/template-editor/QuestionSettings";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { QuestionEditorActions } from "@/components/admin/template-editor/hooks/useQuestionEditorActions";

afterEach(() => cleanup());

function makeActions(
  overrides: Partial<QuestionEditorActions> = {},
): QuestionEditorActions {
  return {
    changeType: jest.fn(),
    removeOption: jest.fn(),
    updateScale: jest.fn(),
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_Q",
    sectionStableKey: "S1",
    label: "Sample label",
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
    ...overrides,
  };
}

interface RenderOpts {
  isReadOnly?: boolean;
  isUnlocked?: boolean;
  actions?: QuestionEditorActions;
  onUpdate?: (patch: Partial<QuestionDraftRow>) => void;
}

function renderSettings(question: QuestionDraftRow, opts: RenderOpts = {}) {
  const actions = opts.actions ?? makeActions();
  const onUpdate = opts.onUpdate ?? jest.fn();
  const utils = render(
    <QuestionSettings
      question={question}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked={opts.isUnlocked ?? true}
      onUpdate={onUpdate}
      actions={actions}
    />,
  );
  return { ...utils, actions, onUpdate };
}

describe("QuestionSettings — per-type config body (ED9 T4)", () => {
  it("SLIDER_LIKERT renders the slider settings (min/max/step + both anchor labels)", () => {
    renderSettings(
      makeQuestion({
        type: "SLIDER_LIKERT",
        scaleMin: 0,
        scaleMax: 10,
        scaleStep: 1,
        anchorMin: "Not at all",
        anchorMax: "Completely",
      }),
    );
    expect(screen.getByText("Slider settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Scale min")).toHaveValue(0);
    expect(screen.getByLabelText("Scale max")).toHaveValue(10);
    expect(screen.getByLabelText("Scale step")).toHaveValue(1);
    expect(screen.getByLabelText("Label for the lowest point")).toHaveValue(
      "Not at all",
    );
    expect(screen.getByLabelText("Label for the highest point")).toHaveValue(
      "Completely",
    );
    // Nothing from the other types leaks in.
    expect(screen.queryByText("Answer options")).not.toBeInTheDocument();
    expect(screen.queryByTestId("number-config-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("text-config-note")).not.toBeInTheDocument();
  });

  it("SLIDER scale edits route through the shared actions.updateScale", () => {
    const q = makeQuestion({ type: "SLIDER_LIKERT" });
    const { actions } = renderSettings(q);
    fireEvent.change(screen.getByLabelText("Scale max"), {
      target: { value: "7" },
    });
    expect(actions.updateScale).toHaveBeenCalledWith(q, { scaleMax: 7 });
  });

  it("MULTI_CHOICE renders keyed options, '+ Add option', and Max choices", () => {
    renderSettings(
      makeQuestion({
        type: "MULTI_CHOICE",
        isRequired: false,
        maxChoices: 2,
        options: [
          { key: "K1", label: "Cash flow", isNew: false },
          { key: "K2", label: "Talent", isNew: false },
          { key: "K3", label: "Market fit", isNew: false },
        ],
      }),
    );
    expect(screen.getByText("Answer options")).toBeInTheDocument();
    expect(screen.getByLabelText("Option 1 label")).toHaveValue("Cash flow");
    expect(screen.getByLabelText("Option 2 label")).toHaveValue("Talent");
    expect(screen.getByLabelText("Option 3 label")).toHaveValue("Market fit");
    expect(screen.getByTestId("q-option-add")).toHaveTextContent("+ Add option");
    expect(screen.getByLabelText("Max choices")).toHaveValue(2);
  });

  it("MULTI_CHOICE '+ Add option' appends a blank option via onUpdate", () => {
    const q = makeQuestion({
      type: "MULTI_CHOICE",
      isRequired: false,
      options: [{ key: "K1", label: "Cash flow", isNew: false }],
    });
    const { onUpdate } = renderSettings(q);
    fireEvent.click(screen.getByTestId("q-option-add"));
    expect(onUpdate).toHaveBeenCalledWith({
      options: [
        { key: "K1", label: "Cash flow", isNew: false },
        { key: "", label: "", isNew: true },
      ],
    });
  });

  it("MULTI_CHOICE option remove routes through the shared actions.removeOption", () => {
    const q = makeQuestion({
      type: "MULTI_CHOICE",
      isRequired: false,
      options: [
        { key: "K1", label: "Cash flow", isNew: false },
        { key: "K2", label: "Talent", isNew: false },
      ],
    });
    const { actions } = renderSettings(q);
    fireEvent.click(screen.getByTestId("q-option-remove-1"));
    expect(actions.removeOption).toHaveBeenCalledWith(q, 1);
  });

  it("NUMBER renders the number-config note and no scale/options block", () => {
    renderSettings(
      makeQuestion({ type: "NUMBER", isRequired: false }),
    );
    expect(screen.getByTestId("number-config-note")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.queryByText("Slider settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Answer options")).not.toBeInTheDocument();
  });

  it("TEXT renders the short-text note and NO scale block", () => {
    renderSettings(makeQuestion({ type: "TEXT", isRequired: false }));
    expect(screen.getByTestId("text-config-note")).toBeInTheDocument();
    expect(screen.getByText("Short text")).toBeInTheDocument();
    expect(screen.queryByText("Slider settings")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scale min")).not.toBeInTheDocument();
  });

  it("isReadOnly disables the slider inputs (locked/inherited)", () => {
    renderSettings(
      makeQuestion({ type: "SLIDER_LIKERT", isInherited: true }),
      { isReadOnly: true },
    );
    expect(screen.getByLabelText("Scale min")).toBeDisabled();
    expect(screen.getByLabelText("Scale max")).toBeDisabled();
    expect(screen.getByLabelText("Scale step")).toBeDisabled();
    expect(screen.getByLabelText("Label for the lowest point")).toBeDisabled();
    expect(screen.getByLabelText("Label for the highest point")).toBeDisabled();
  });

  it("isReadOnly disables the MULTI_CHOICE option inputs + add button", () => {
    renderSettings(
      makeQuestion({
        type: "MULTI_CHOICE",
        isRequired: false,
        options: [{ key: "K1", label: "Cash flow", isNew: false }],
      }),
      { isReadOnly: true },
    );
    expect(screen.getByLabelText("Option 1 label")).toBeDisabled();
    expect(screen.getByTestId("q-option-remove-0")).toBeDisabled();
    expect(screen.getByTestId("q-option-add")).toBeDisabled();
    expect(screen.getByLabelText("Max choices")).toBeDisabled();
  });

  it("flag-off (isUnlocked=false) non-slider shows the read-only fallback, not the Wave-T block", () => {
    renderSettings(makeQuestion({ type: "NUMBER", isRequired: false }), {
      isUnlocked: false,
    });
    // The Wave-T flag-on NUMBER note is gated on isUnlocked.
    expect(screen.queryByTestId("number-config-note")).not.toBeInTheDocument();
    expect(
      screen.getByText(/editing not available for this question type in v1/),
    ).toBeInTheDocument();
  });
});
