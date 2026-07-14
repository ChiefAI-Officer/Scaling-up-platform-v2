/**
 * ED5 Task 1 (B-4 DRY, co-validate C1) — question-widget-mapper.
 *
 * `QuestionCanvas`'s local `toForInput` and `QuestionInspector`'s
 * `FindingsPreview` local `forInput` object are near-duplicate mappers from
 * a draft question row to the respondent-widget shape. This test proves the
 * new shared `toQuestionForInput` reproduces BOTH call sites' exact behavior
 * (label/key fallbacks, isRequired handling, per-type scale/options), and
 * that the new `shapeSignature` captures only the widget SHAPE (type, scale,
 * option count/maxChoices) — not label/help/required.
 */
import {
  toQuestionForInput,
  shapeSignature,
} from "@/components/admin/template-editor/question-widget-mapper";
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
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    sortOrder: 0,
    isInherited: false,
    isNewToDraft: false,
    // loosely-typed test fixture (babel-jest strips types); cast for any
    // fields the evolving QuestionDraftRow adds.
    ...overrides,
  } as QuestionDraftRow;
}

function multiChoiceQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return sliderQuestion({
    type: "MULTI_CHOICE",
    options: [
      { key: "a", label: "Option A", isNew: false },
      { key: "", label: "", isNew: true },
      { key: "b", label: "", isNew: false },
    ],
    maxChoices: 2,
    ...overrides,
  } as Partial<QuestionDraftRow>);
}

describe("toQuestionForInput", () => {
  it("applies canvas-style fallbacks (blank label+key) and passes real isRequired", () => {
    const q = sliderQuestion({ stableKey: "", label: "" });
    const forInput = toQuestionForInput(q, {
      labelFallback: "(untitled question)",
      keyFallback: "__canvas__",
    });
    expect(forInput.stableKey).toBe("__canvas__");
    expect(forInput.label).toBe("(untitled question)");
    expect(forInput.isRequired).toBe(true); // real isRequired, not forced
    expect(forInput.scale).toEqual({
      min: 0,
      max: 10,
      step: 1,
      anchorMin: "Not at all",
      anchorMax: "Completely",
    });
  });

  it("does not apply fallbacks when label/key are present", () => {
    const q = sliderQuestion();
    const forInput = toQuestionForInput(q, {
      labelFallback: "(untitled question)",
      keyFallback: "__canvas__",
    });
    expect(forInput.stableKey).toBe("S1_Q1");
    expect(forInput.label).toBe("How aligned is the team?");
  });

  it("applies preview-style fallbacks + forceRequired:false regardless of the real isRequired", () => {
    const q = sliderQuestion({ stableKey: "", label: "", isRequired: true });
    const forInput = toQuestionForInput(q, {
      labelFallback: "Sample answer",
      keyFallback: "__preview__",
      forceRequired: false,
    });
    expect(forInput.stableKey).toBe("__preview__");
    expect(forInput.label).toBe("Sample answer");
    expect(forInput.isRequired).toBe(false);
  });

  it("omits scale for non-SLIDER_LIKERT types", () => {
    const q = sliderQuestion({ type: "TEXT" });
    const forInput = toQuestionForInput(q, {
      labelFallback: "x",
      keyFallback: "y",
    });
    expect(forInput.scale).toBeUndefined();
  });

  it("maps MULTI_CHOICE options (dropping blank keys, label falls back to key) + maxChoices", () => {
    const q = multiChoiceQuestion();
    const forInput = toQuestionForInput(q, {
      labelFallback: "x",
      keyFallback: "y",
    });
    expect(forInput.options).toEqual([
      { key: "a", label: "Option A" },
      { key: "b", label: "b" },
    ]);
    expect(forInput.maxChoices).toBe(2);
  });

  it("omits maxChoices when null", () => {
    const q = multiChoiceQuestion({ maxChoices: null });
    const forInput = toQuestionForInput(q, {
      labelFallback: "x",
      keyFallback: "y",
    });
    expect(forInput.maxChoices).toBeUndefined();
  });
});

describe("shapeSignature", () => {
  it("is equal when only the label differs", () => {
    const a = sliderQuestion({ label: "Label A" });
    const b = sliderQuestion({ label: "Completely different label" });
    expect(shapeSignature(a)).toBe(shapeSignature(b));
  });

  it("is equal when only helpText/isRequired differ", () => {
    const a = sliderQuestion({ helpText: "help A", isRequired: true });
    const b = sliderQuestion({ helpText: "help B", isRequired: false });
    expect(shapeSignature(a)).toBe(shapeSignature(b));
  });

  it("differs when the type changes", () => {
    const a = sliderQuestion({ type: "SLIDER_LIKERT" });
    const b = sliderQuestion({ type: "NUMBER" });
    expect(shapeSignature(a)).not.toBe(shapeSignature(b));
  });

  it("differs when the slider scale changes", () => {
    const a = sliderQuestion({ scaleMax: 10 });
    const b = sliderQuestion({ scaleMax: 5 });
    expect(shapeSignature(a)).not.toBe(shapeSignature(b));
  });

  it("differs when MULTI_CHOICE option count changes", () => {
    const a = multiChoiceQuestion();
    const b = multiChoiceQuestion({
      options: [{ key: "a", label: "Option A", isNew: false }],
    });
    expect(shapeSignature(a)).not.toBe(shapeSignature(b));
  });

  it("differs when MULTI_CHOICE maxChoices changes", () => {
    const a = multiChoiceQuestion({ maxChoices: 2 });
    const b = multiChoiceQuestion({ maxChoices: 1 });
    expect(shapeSignature(a)).not.toBe(shapeSignature(b));
  });
});
