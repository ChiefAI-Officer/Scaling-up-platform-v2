/**
 * ED9 Task 6 (spec 19al-plan) — useSingleColumnBuilderController unit tests.
 *
 * `useSingleColumnBuilderController` is the orchestration lifted VERBATIM out of
 * `SingleColumnFormBuilder` so a later ED9 task (`FormsBuilder`, the flag-ON
 * Google-Forms Build body) reuses the SAME glue — DnD wiring, section grouping,
 * card view-models, focus restoration, SR announcements, command wiring — rather
 * than cloning it (Codex co-validate finding #3). `SingleColumnFormBuilder` is
 * now a THIN renderer over this hook, so its full DOM/behavior suites
 * (single-column-*.test.tsx) + the ED9 golden shell baseline pin the rendered
 * output end-to-end. THIS file pins the headless controller contract directly at
 * the hook surface: the per-card `vms`, the ascending-sortOrder `bySection`
 * grouping, and the pure-`resolveOutlineDrop`-driven `handleDragEnd` (within-
 * section reorder dispatches `model.reorderQuestions`; a cross-section drag is
 * ignored — the "Move to section…" select is the reliable cross-section path).
 * Fixtures mirror single-column-builder.test.tsx (Financials/People, Revenue +
 * Margin) but in the direct `QuestionDraftRow` shape the hook consumes.
 */
import { renderHook, act } from "@testing-library/react";
import type { DragEndEvent } from "@dnd-kit/core";

import { useSingleColumnBuilderController } from "@/components/admin/template-editor/hooks/useSingleColumnBuilderController";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { TemplateEditorModel } from "@/components/admin/template-editor/hooks/useTemplateEditorModel";

// window.confirm is exercised only by command handlers (not these tests), but
// stub it so nothing hangs if a handler is reached inadvertently.
const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});

// ── Fixtures ────────────────────────────────────────────────────────────────
function q(
  uid: string,
  stableKey: string,
  sectionStableKey: string,
  sortOrder: number,
  extra: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid,
    stableKey,
    sectionStableKey,
    label: `${stableKey} label`,
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder,
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
    ...extra,
  };
}

const SECTIONS: SectionDraft[] = [
  { uid: "s1", stableKey: "S1", name: "Financials" },
  { uid: "s2", stableKey: "S2", name: "People" },
];

// Mirror single-column-builder.test.tsx (Revenue + Margin under Financials; the
// People section empty), but listed OUT of sortOrder order in the array on
// purpose so `bySection` proves it sorts ascending, not by array position.
function baseQuestions(): QuestionDraftRow[] {
  return [
    q("u2", "S1_margin", "S1", 2, {
      label: "Margin",
      type: "NUMBER",
      isRequired: false,
    }),
    q("u1", "S1_rev", "S1", 1, {
      label: "Revenue",
      type: "SLIDER_LIKERT",
      isRequired: true,
    }),
  ];
}

interface ModelOverrides {
  sections?: SectionDraft[];
  questions?: QuestionDraftRow[];
  focusedQuestionUid?: string | null;
  reorderQuestions?: jest.Mock;
}

function buildModel(o: ModelOverrides = {}) {
  const sections = o.sections ?? SECTIONS;
  const questions = o.questions ?? baseQuestions();
  const reorderQuestions = o.reorderQuestions ?? jest.fn();
  const model = {
    sections,
    questions,
    selection: {
      focusedQuestionUid: o.focusedQuestionUid ?? null,
      setFocusedQuestionUid: jest.fn(),
      setSectionCollapsed: jest.fn(),
    },
    addQuestion: jest.fn(() => "u-new"),
    duplicateQuestion: jest.fn(() => "u-copy"),
    deleteQuestion: jest.fn((uid: string) => ({
      removedUid: uid,
      affectedDependentUids: [],
    })),
    deleteSection: jest.fn(() => ({
      removedSectionKey: "",
      removedQuestionUids: [],
      affectedDependentUids: [],
    })),
    moveQuestionToSection: jest.fn(),
    reorderQuestions,
  };
  return { model, reorderQuestions };
}

function renderController(
  o: ModelOverrides = {},
  opts: {
    conditionalEnabled?: boolean;
    isReadOnly?: boolean;
    isUnlocked?: boolean;
  } = {},
) {
  const built = buildModel(o);
  const { result } = renderHook(() =>
    useSingleColumnBuilderController(
      built.model as unknown as TemplateEditorModel,
      {
        conditionalEnabled: opts.conditionalEnabled ?? true,
        isReadOnly: opts.isReadOnly ?? false,
        isUnlocked: opts.isUnlocked ?? true,
      },
    ),
  );
  return { ...built, result };
}

// ════════════════════════════════════════════════════════════════════════
describe("useSingleColumnBuilderController", () => {
  it("returns a card view-model for each question", () => {
    const { result } = renderController();
    const { vms } = result.current;
    expect(vms.size).toBe(2);
    expect(vms.get("u1")?.label).toBe("Revenue");
    expect(vms.get("u1")?.type).toBe("SLIDER_LIKERT");
    expect(vms.get("u2")?.label).toBe("Margin");
    expect(vms.get("u2")?.type).toBe("NUMBER");
    // Position is 1-based within-section ascending sortOrder.
    expect(vms.get("u1")?.position).toBe(1);
    expect(vms.get("u2")?.position).toBe(2);
  });

  it("groups questions by section in ascending sortOrder (bySection)", () => {
    const { result } = renderController();
    const { bySection } = result.current;
    // Financials: u1 (sortOrder 1) before u2 (sortOrder 2), despite the array
    // listing u2 first.
    expect((bySection.get("S1") ?? []).map((q) => q.uid)).toEqual(["u1", "u2"]);
    // People: empty section is present with an empty list.
    expect(bySection.get("S2")).toEqual([]);
  });

  it("handleDragEnd dispatches a within-section reorder to model.reorderQuestions", () => {
    const { result, reorderQuestions } = renderController();
    act(() => {
      result.current.handleDragEnd({
        active: { id: "u1" },
        over: { id: "u2" },
      } as unknown as DragEndEvent);
    });
    expect(reorderQuestions).toHaveBeenCalledTimes(1);
    expect(reorderQuestions).toHaveBeenCalledWith("S1", ["u2", "u1"]);
  });

  it("handleDragEnd ignores a cross-section drop (move stays on the select)", () => {
    const { result, reorderQuestions } = renderController();
    act(() => {
      // Dropping u1 (S1) onto the S2 container id is a MOVE, not a reorder.
      result.current.handleDragEnd({
        active: { id: "u1" },
        over: { id: "S2" },
      } as unknown as DragEndEvent);
    });
    expect(reorderQuestions).not.toHaveBeenCalled();
  });

  it("handleDragEnd is a no-op when there is no drop target", () => {
    const { result, reorderQuestions } = renderController();
    act(() => {
      result.current.handleDragEnd({
        active: { id: "u1" },
        over: null,
      } as unknown as DragEndEvent);
    });
    expect(reorderQuestions).not.toHaveBeenCalled();
  });
});
