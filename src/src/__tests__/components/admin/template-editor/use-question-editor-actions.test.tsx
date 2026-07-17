/**
 * ED9 Task 3 (spec 19al-plan) — useQuestionEditorActions command-layer tests.
 *
 * `useQuestionEditorActions` is the SHARED destructive-edit command layer
 * lifted VERBATIM out of `QuestionInspector` (the inline `handleTypeChange` /
 * `handleRemoveOption` / `handleScaleUpdate`). BOTH the existing inspector and
 * the future inline type-picker (a later ED9 task) run their destructive edits
 * through this ONE layer so a type change can never become "just setType" — it
 * still fires the confirm(s), drops findings rules, and clears `showIf` on
 * dependents. These tests pin that contract at the hook surface in isolation;
 * the exact rendered DOM + end-to-end behavior stay pinned by
 * `ed9-golden-snapshots` + the frozen byte-equivalence/parity suites.
 */

import { act, renderHook } from "@testing-library/react";

import { useQuestionEditorActions } from "@/components/admin/template-editor/hooks/useQuestionEditorActions";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

// ── window.confirm ──────────────────────────────────────────────────────────
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});
beforeEach(() => {
  (window.confirm as jest.Mock).mockClear();
  (window.confirm as jest.Mock).mockImplementation(() => true);
});

// ── Fixtures (modeled on single-column-inspector-bare.test.tsx) ──────────────
function makeQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u1",
    stableKey: "S1_MC",
    sectionStableKey: "S1",
    label: "Which apply?",
    helpText: "",
    isRequired: false,
    type: "MULTI_CHOICE",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [{ key: "K1", label: "First", isNew: false }],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  } as QuestionDraftRow;
}

function dependent(overrides: Partial<QuestionDraftRow> = {}): QuestionDraftRow {
  return makeQuestion({
    uid: "d1",
    stableKey: "S1_DEP",
    type: "SLIDER_LIKERT",
    options: [],
    showIf: { questionKey: "S1_MC", optionKey: "K1" },
    ...overrides,
  });
}

interface DepOverrides {
  isUnlocked?: boolean;
  findingsEnabled?: boolean;
  conditionalEnabled?: boolean;
  showIfDependents?: QuestionDraftRow[];
  publishedOptionKeys?: Record<string, readonly string[]>;
}

function renderActions(o: DepOverrides = {}) {
  const onUpdate = jest.fn();
  const onClearDependents = jest.fn();
  const { result } = renderHook(() =>
    useQuestionEditorActions({
      isUnlocked: o.isUnlocked ?? true,
      findingsEnabled: o.findingsEnabled ?? true,
      conditionalEnabled: o.conditionalEnabled ?? true,
      showIfDependents: o.showIfDependents ?? [],
      onClearDependents,
      publishedOptionKeys: o.publishedOptionKeys ?? {},
      onUpdate,
    }),
  );
  return { result, onUpdate, onClearDependents };
}

describe("useQuestionEditorActions (ED9 T3 extraction)", () => {
  describe("changeType", () => {
    it("MULTI_CHOICE→SLIDER_LIKERT confirms, and on accept clears findings AND clears dependents", () => {
      const q = makeQuestion({ findingOptionTexts: { K1: "some finding" } });
      const dep = dependent();
      const { result, onUpdate, onClearDependents } = renderActions({
        showIfDependents: [dep],
      });

      act(() => result.current.changeType(q, "SLIDER_LIKERT"));

      // The confirm fired, naming BOTH the findings loss and the dependents.
      expect(window.confirm).toHaveBeenCalledTimes(1);
      const msg = (window.confirm as jest.Mock).mock.calls[0][0] as string;
      expect(msg).toContain("Change this question's type");
      expect(msg).toContain("finding rule");
      expect(msg).toContain("shown conditionally on this one");
      expect(msg).toContain("S1_DEP");

      // On accept: type set + findings dropped, and dependents' showIf cleared.
      expect(onUpdate).toHaveBeenCalledWith({
        type: "SLIDER_LIKERT",
        findingBands: [],
        findingOptionTexts: {},
      });
      expect(onClearDependents).toHaveBeenCalledWith(["d1"]);
    });

    it("declined confirm ⇒ no mutation, no dependent-clear", () => {
      (window.confirm as jest.Mock).mockImplementation(() => false);
      const q = makeQuestion({ findingOptionTexts: { K1: "some finding" } });
      const { result, onUpdate, onClearDependents } = renderActions({
        showIfDependents: [dependent()],
      });

      act(() => result.current.changeType(q, "SLIDER_LIKERT"));

      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onClearDependents).not.toHaveBeenCalled();
    });

    it("no findings + no dependents ⇒ sets type silently (no confirm)", () => {
      const q = makeQuestion({ findingOptionTexts: {}, type: "SLIDER_LIKERT" });
      const { result, onUpdate, onClearDependents } = renderActions();

      act(() => result.current.changeType(q, "NUMBER"));

      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith({ type: "NUMBER" });
      expect(onClearDependents).not.toHaveBeenCalled();
    });

    it("same type ⇒ no-op", () => {
      const q = makeQuestion({ type: "SLIDER_LIKERT" });
      const { result, onUpdate } = renderActions();
      act(() => result.current.changeType(q, "SLIDER_LIKERT"));
      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe("removeOption", () => {
    it("fires the option-remove confirm for a published option, then removes it + its finding", () => {
      const q = makeQuestion({ findingOptionTexts: { K1: "finding for K1" } });
      const { result, onUpdate } = renderActions({
        publishedOptionKeys: { S1_MC: ["K1"] },
      });

      act(() => result.current.removeOption(q, 0));

      expect(window.confirm).toHaveBeenCalledTimes(1);
      const msg = (window.confirm as jest.Mock).mock.calls[0][0] as string;
      expect(msg).toContain('Remove option "K1"');
      expect(msg).toContain("finding rule");

      expect(onUpdate).toHaveBeenCalledWith({
        options: [],
        findingOptionTexts: {},
      });
    });

    it("new-to-draft (unpublished) option removes silently, no confirm", () => {
      const q = makeQuestion({
        options: [{ key: "K1", label: "First", isNew: false }],
        findingOptionTexts: {},
      });
      const { result, onUpdate } = renderActions({ publishedOptionKeys: {} });

      act(() => result.current.removeOption(q, 0));

      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith({ options: [] });
    });
  });

  describe("updateScale", () => {
    it("fires the scale-change confirm on an inherited slider, then applies", () => {
      const q = makeQuestion({
        type: "SLIDER_LIKERT",
        options: [],
        isInherited: true,
      });
      const { result, onUpdate } = renderActions({ isUnlocked: true });

      act(() => result.current.updateScale(q, { scaleMax: 5 }));

      expect(window.confirm).toHaveBeenCalledTimes(1);
      const msg = (window.confirm as jest.Mock).mock.calls[0][0] as string;
      expect(msg).toContain("Change the scale of inherited question");
      expect(onUpdate).toHaveBeenCalledWith({ scaleMax: 5 });

      // Acknowledged once per question — a second edit applies silently.
      act(() => result.current.updateScale(q, { scaleMin: 1 }));
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({ scaleMin: 1 });
    });

    it("new-to-draft slider scale edits apply silently (no confirm)", () => {
      const q = makeQuestion({
        type: "SLIDER_LIKERT",
        options: [],
        isInherited: false,
      });
      const { result, onUpdate } = renderActions({ isUnlocked: true });

      act(() => result.current.updateScale(q, { scaleStep: 2 }));

      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith({ scaleStep: 2 });
    });
  });
});
