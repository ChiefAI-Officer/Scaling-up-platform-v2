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
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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
});
