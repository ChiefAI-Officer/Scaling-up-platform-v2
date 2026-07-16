/**
 * ED3 Task 7 — QuestionInspector (extracted from QuestionsTab).
 *
 * Light structural check per the plan: render `QuestionInspector` directly
 * with a focused question and assert the config fields wire up + a field
 * change invokes the passed handler. NOT a full DOM snapshot — the
 * byte-equivalence guard (editor-byte-equivalence.test.tsx) already pins the
 * exact rendered output; this only proves the extracted public component
 * mounts standalone and its panels wire to props.
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
  QuestionInspector,
  type ShowIfGateOption,
} from "@/components/admin/template-editor/QuestionInspector";
import type { QuestionDraft } from "@/components/admin/template-editor/QuestionsTab";

afterEach(cleanup);

function makeQuestion(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    uid: "u_test",
    stableKey: "S1_Q1",
    sectionStableKey: "S1",
    label: "How strong is your leadership team?",
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 3,
    scaleStep: 1,
    anchorMin: "Not true",
    anchorMax: "Completely true",
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

const baseProps = {
  isReadOnly: false,
  isUnlocked: true,
  findingsEnabled: true,
  conditionalEnabled: true,
  showIfGates: [] as ShowIfGateOption[],
  showIfDependents: [] as QuestionDraft[],
  onClearDependents: jest.fn(),
  publishedOptionKeys: {} as Record<string, readonly string[]>,
};

describe("QuestionInspector (ED3 T7 extraction)", () => {
  it("renders the SLIDER config fields + findings/show-if panels for a focused slider question (flags on)", () => {
    render(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion()}
        onUpdate={jest.fn()}
      />,
    );

    // The public inspector shell mounts.
    expect(screen.getByTestId("questions-config-form")).toBeInTheDocument();

    // SLIDER_LIKERT scale config fields render.
    expect(screen.getByLabelText("Scale min")).toBeInTheDocument();
    expect(screen.getByLabelText("Scale max")).toBeInTheDocument();
    expect(screen.getByLabelText("Scale step")).toBeInTheDocument();

    // Sub-panels wire up behind their flags.
    expect(screen.getByTestId("q-findings-panel")).toBeInTheDocument();
    expect(screen.getByTestId("q-showif-panel")).toBeInTheDocument();
  });

  it("renders the MULTI_CHOICE options editor for a multi-choice question", () => {
    const q = makeQuestion({
      stableKey: "S1_Q2",
      type: "MULTI_CHOICE",
      options: [{ key: "K1", label: "First option", isNew: false }],
    });

    render(
      <QuestionInspector {...baseProps} question={q} onUpdate={jest.fn()} />,
    );

    expect(screen.getByTestId("multichoice-config")).toBeInTheDocument();
    expect(screen.getByTestId("q-option-add")).toBeInTheDocument();
    expect(screen.getByTestId("q-option-label-0")).toHaveValue("First option");
  });

  it("invokes the passed onUpdate handler when a field control changes", () => {
    const onUpdate = jest.fn();
    render(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion()}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Reworded label" },
    });

    expect(onUpdate).toHaveBeenCalledWith({ label: "Reworded label" });
  });

  // ── ED5 Task 2 (B-4/A-3/C1) — findings-preview keyed reset ─────────────
  it("relabels the findings preview header to 'Test which finding fires'", () => {
    render(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion()}
        onUpdate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("q-findings-toggle"));

    expect(screen.getByText(/test which finding fires/i)).toBeInTheDocument();
    expect(screen.queryByText(/test a value/i)).not.toBeInTheDocument();
  });

  it("resets the findings-preview throwaway widget when the focused question's SHAPE changes (same uid)", () => {
    const { rerender } = render(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion()}
        onUpdate={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("q-findings-toggle"));

    const preview = () => screen.getByTestId("q-findings-preview");
    const previewSlider = () =>
      within(preview()).getByRole("slider") as HTMLInputElement;

    fireEvent.change(previewSlider(), { target: { value: "2" } });
    expect(previewSlider().getAttribute("aria-valuenow")).toBe("2");

    // Same uid, but the scale (widget SHAPE) changed — shapeSignature differs,
    // so the preview must remount and its throwaway sample must clear.
    rerender(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion({ scaleMax: 10 })}
        onUpdate={jest.fn()}
      />,
    );
    expect(previewSlider().getAttribute("aria-valuenow")).toBeNull();
  });

  it("resets the findings-preview throwaway widget when focus moves to a different question (different uid, same shape)", () => {
    const { rerender } = render(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion()}
        onUpdate={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("q-findings-toggle"));

    const preview = () => screen.getByTestId("q-findings-preview");
    const previewSlider = () =>
      within(preview()).getByRole("slider") as HTMLInputElement;

    fireEvent.change(previewSlider(), { target: { value: "3" } });
    expect(previewSlider().getAttribute("aria-valuenow")).toBe("3");

    // Different question entirely (new uid), identical shape otherwise.
    rerender(
      <QuestionInspector
        {...baseProps}
        question={makeQuestion({ uid: "u_test_2", stableKey: "S1_Q2" })}
        onUpdate={jest.fn()}
      />,
    );
    expect(previewSlider().getAttribute("aria-valuenow")).toBeNull();
  });

  // ── ED7 — de-jargon: friendly type names + plain config headings ────────
  describe("ED7 de-jargon", () => {
    it("shows friendly names in the type select while option VALUES stay enum strings", () => {
      render(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion()}
          onUpdate={jest.fn()}
        />,
      );
      const select = screen.getByLabelText("Question Type");
      expect(
        within(select).getByRole("option", { name: "Slider" }),
      ).toHaveValue("SLIDER_LIKERT");
      expect(
        within(select).getByRole("option", { name: "Multiple choice" }),
      ).toHaveValue("MULTI_CHOICE");
      expect(
        within(select).getByRole("option", { name: "Number" }),
      ).toHaveValue("NUMBER");
      expect(
        within(select).getByRole("option", { name: "Short text" }),
      ).toHaveValue("TEXT");
      expect(within(select).queryByText("SLIDER_LIKERT")).toBeNull();
    });

    it("titles the slider config block 'Slider settings'", () => {
      render(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion()}
          onUpdate={jest.fn()}
        />,
      );
      expect(screen.getByText("Slider settings")).toBeInTheDocument();
      expect(screen.queryByText(/SLIDER_LIKERT — config/)).toBeNull();
    });

    it("explains slider storage in plain language, no formulas or code chips", () => {
      render(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion()}
          onUpdate={jest.fn()}
        />,
      );
      expect(
        screen.getByLabelText("Label for the lowest point"),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Label for the highest point"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Respondents pick a whole number between the min and max/,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/% step === 0/)).toBeNull();
      expect(screen.queryByText(/stored as integers/)).toBeNull();
    });

    it("titles the multi-choice config block 'Answer options'", () => {
      render(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion({
            stableKey: "S1_Q2",
            type: "MULTI_CHOICE",
            options: [{ key: "K1", label: "First option", isNew: false }],
          })}
          onUpdate={jest.fn()}
        />,
      );
      const block = screen.getByTestId("multichoice-config");
      expect(within(block).getByText("Answer options")).toBeInTheDocument();
      expect(screen.queryByText(/MULTI_CHOICE — options/)).toBeNull();
    });

    it("titles the number and text config notes without raw enum headings", () => {
      const { rerender } = render(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion({ stableKey: "S1_Q3", type: "NUMBER" })}
          onUpdate={jest.fn()}
        />,
      );
      const numberBlock = screen.getByTestId("number-config-note");
      expect(within(numberBlock).getByText("Number")).toBeInTheDocument();
      expect(screen.queryByText(/NUMBER — numeric entry/)).toBeNull();

      rerender(
        <QuestionInspector
          {...baseProps}
          question={makeQuestion({ stableKey: "S1_Q4", type: "TEXT" })}
          onUpdate={jest.fn()}
        />,
      );
      const textBlock = screen.getByTestId("text-config-note");
      expect(within(textBlock).getByText("Short text")).toBeInTheDocument();
      expect(screen.queryByText(/TEXT — free text/)).toBeNull();
    });
  });
});
