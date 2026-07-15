/**
 * ED6 (spec 19ah), Task 4 — useEditorCommands unit tests.
 *
 * `useEditorCommands` is the SHARED confirm→command→focus orchestration hook
 * lifted VERBATIM out of `EditorOutline` so the flag-ON single-column builder
 * (later ED6 PRs) and `EditorOutline` run the SAME glue — no second copy
 * (co-validate §15.5). These tests pin the extracted contract directly at the
 * hook surface: the `window.confirm` gate (declined ⇒ zero model calls + no
 * focus move), the single correct model command per action, and the pending
 * DOM-focus target (`computeSurvivorFocus`'s survivor for a delete; the
 * new/copy uid for add/duplicate; the "+ Add question" control when a delete
 * empties the template). The end-to-end DOM focus/scroll + byte-equal behavior
 * stay pinned through the public UI by EditorOutline.test.tsx + the ED4 parity
 * suite; this file locks the headless orchestration in isolation.
 */

import { act, renderHook } from "@testing-library/react";

import { useEditorCommands } from "@/components/admin/template-editor/hooks/useEditorCommands";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

// ── window.confirm ────────────────────────────────────────────────────────
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
    scaleMax: 3,
    scaleStep: 1,
    anchorMin: "lo",
    anchorMax: "hi",
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
  { uid: "s1", stableKey: "S1", name: "Section One" },
  { uid: "s2", stableKey: "S2", name: "Section Two" },
];

function baseQuestions(): QuestionDraftRow[] {
  return [
    q("u1", "S1_q1", "S1", 1),
    q("u2", "S1_q2", "S1", 2),
    q("u3", "S2_q3", "S2", 1),
  ];
}

interface ModelOverrides {
  sections?: SectionDraft[];
  questions?: QuestionDraftRow[];
  focusedQuestionUid?: string | null;
  addQuestion?: jest.Mock;
  duplicateQuestion?: jest.Mock;
  deleteQuestion?: jest.Mock;
  deleteSection?: jest.Mock;
  moveQuestionToSection?: jest.Mock;
}

function buildModel(o: ModelOverrides = {}) {
  const sections = o.sections ?? SECTIONS;
  const questions = o.questions ?? baseQuestions();
  const setFocusedQuestionUid = jest.fn();
  const setSectionCollapsed = jest.fn();
  const addQuestion = o.addQuestion ?? jest.fn(() => "u-new");
  const duplicateQuestion = o.duplicateQuestion ?? jest.fn(() => "u-copy");
  const deleteQuestion =
    o.deleteQuestion ??
    jest.fn((uid: string) => ({ removedUid: uid, affectedDependentUids: [] }));
  const deleteSection =
    o.deleteSection ??
    jest.fn((uid: string) => {
      const sec = sections.find((s) => s.uid === uid);
      const removedSectionKey = sec?.stableKey ?? "";
      return {
        removedSectionKey,
        removedQuestionUids: questions
          .filter((x) => x.sectionStableKey === removedSectionKey)
          .map((x) => x.uid),
        affectedDependentUids: [],
      };
    });
  const moveQuestionToSection = o.moveQuestionToSection ?? jest.fn();

  const model = {
    sections,
    questions,
    selection: {
      focusedQuestionUid: o.focusedQuestionUid ?? null,
      setFocusedQuestionUid,
      setSectionCollapsed,
    },
    addQuestion,
    duplicateQuestion,
    deleteQuestion,
    reorderQuestions: jest.fn(),
    deleteSection,
    moveQuestionToSection,
  };

  return {
    model,
    setFocusedQuestionUid,
    setSectionCollapsed,
    addQuestion,
    duplicateQuestion,
    deleteQuestion,
    deleteSection,
    moveQuestionToSection,
  };
}

function renderCommands(
  o: ModelOverrides = {},
  opts: {
    conditionalEnabled?: boolean;
    isReadOnly?: boolean;
    isUnlocked?: boolean;
  } = {},
) {
  const built = buildModel(o);
  const { result } = renderHook(() =>
    useEditorCommands(built.model, {
      conditionalEnabled: opts.conditionalEnabled ?? true,
      isReadOnly: opts.isReadOnly ?? false,
      isUnlocked: opts.isUnlocked ?? true,
    }),
  );
  return { ...built, result };
}

// ════════════════════════════════════════════════════════════════════════
describe("useEditorCommands — addQuestion", () => {
  it("appends via model.addQuestion, expands the section, focuses + pends the new uid", () => {
    const { result, addQuestion, setFocusedQuestionUid, setSectionCollapsed } =
      renderCommands();

    act(() => {
      result.current.addQuestion("S2");
    });

    expect(addQuestion).toHaveBeenCalledTimes(1);
    expect(addQuestion).toHaveBeenCalledWith("S2");
    expect(setSectionCollapsed).toHaveBeenCalledWith("S2", false);
    expect(setFocusedQuestionUid).toHaveBeenCalledWith("u-new");
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u-new",
    });
  });

  it("is a no-op when read-only", () => {
    const { result, addQuestion, setFocusedQuestionUid } = renderCommands(
      {},
      { isReadOnly: true },
    );
    act(() => {
      result.current.addQuestion("S2");
    });
    expect(addQuestion).not.toHaveBeenCalled();
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
    expect(result.current.consumePendingFocus()).toBeNull();
  });
});

describe("useEditorCommands — duplicateQuestion", () => {
  it("duplicates via model.duplicateQuestion, focuses + pends the copy uid", () => {
    const { result, duplicateQuestion, setFocusedQuestionUid } =
      renderCommands();

    act(() => {
      result.current.duplicateQuestion("u1");
    });

    expect(duplicateQuestion).toHaveBeenCalledTimes(1);
    expect(duplicateQuestion).toHaveBeenCalledWith("u1");
    expect(setFocusedQuestionUid).toHaveBeenCalledWith("u-copy");
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u-copy",
    });
  });
});

describe("useEditorCommands — deleteQuestion", () => {
  it("declined confirm ⇒ no model call, no focus move, no pending focus", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { result, deleteQuestion, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u1",
    });

    act(() => {
      result.current.deleteQuestion("u1");
    });

    expect(deleteQuestion).not.toHaveBeenCalled();
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
    expect(result.current.consumePendingFocus()).toBeNull();
  });

  it("accepted + focused ⇒ one deleteQuestion call, focus + pend the survivor (next sibling)", () => {
    const { result, deleteQuestion, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u1", // S1_q1; next sibling is u2 (S1_q2)
    });

    act(() => {
      result.current.deleteQuestion("u1");
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deleteQuestion).toHaveBeenCalledTimes(1);
    expect(deleteQuestion).toHaveBeenCalledWith("u1");
    // computeSurvivorFocus contract: next in-section sibling.
    expect(setFocusedQuestionUid).toHaveBeenCalledWith("u2");
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u2",
    });
  });

  it("deleting a NON-focused question deletes but leaves focus untouched", () => {
    const { result, deleteQuestion, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u1",
    });

    act(() => {
      result.current.deleteQuestion("u2"); // not the focused one
    });

    expect(deleteQuestion).toHaveBeenCalledTimes(1);
    expect(deleteQuestion).toHaveBeenCalledWith("u2");
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
    expect(result.current.consumePendingFocus()).toBeNull();
  });

  it("deleting the LAST focused question pends the section's + Add question control", () => {
    const only = [q("only", "S1_only", "S1", 1)];
    const { result, deleteQuestion, setFocusedQuestionUid } = renderCommands({
      sections: [{ uid: "s1", stableKey: "S1", name: "Section One" }],
      questions: only,
      focusedQuestionUid: "only",
    });

    act(() => {
      result.current.deleteQuestion("only");
    });

    expect(deleteQuestion).toHaveBeenCalledTimes(1);
    expect(setFocusedQuestionUid).toHaveBeenCalledWith(null);
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "add",
      sectionKey: "S1",
    });
  });
});

describe("useEditorCommands — deleteSection (cascade)", () => {
  it("declined confirm ⇒ no deleteSection call, no focus move", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { result, deleteSection, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u1",
    });

    act(() => {
      result.current.deleteSection("s1");
    });

    expect(deleteSection).not.toHaveBeenCalled();
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
    expect(result.current.consumePendingFocus()).toBeNull();
  });

  it("accepted + focus inside ⇒ one deleteSection call, focus + pend the nearest survivor", () => {
    const { result, deleteSection, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u1", // inside S1; only survivor is u3 (S2)
    });

    act(() => {
      result.current.deleteSection("s1");
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deleteSection).toHaveBeenCalledTimes(1);
    expect(deleteSection).toHaveBeenCalledWith("s1");
    expect(setFocusedQuestionUid).toHaveBeenCalledWith("u3");
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u3",
    });
  });

  it("accepted + focus OUTSIDE the section ⇒ deletes but leaves focus untouched", () => {
    const { result, deleteSection, setFocusedQuestionUid } = renderCommands({
      focusedQuestionUid: "u3", // in S2, deleting S1
    });

    act(() => {
      result.current.deleteSection("s1");
    });

    expect(deleteSection).toHaveBeenCalledTimes(1);
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
    expect(result.current.consumePendingFocus()).toBeNull();
  });
});

describe("useEditorCommands — moveQuestion", () => {
  it("a NON-inherited move skips the confirm, moves once, focuses + pends the moved uid", () => {
    const { result, moveQuestionToSection, setFocusedQuestionUid } =
      renderCommands();

    act(() => {
      result.current.moveQuestion("u1", "S2");
    });

    expect(window.confirm).not.toHaveBeenCalled();
    expect(moveQuestionToSection).toHaveBeenCalledTimes(1);
    expect(moveQuestionToSection).toHaveBeenCalledWith("u1", "S2", undefined);
    expect(setFocusedQuestionUid).toHaveBeenCalledWith("u1");
    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u1",
    });
  });

  it("an INHERITED move confirms; declined ⇒ no move", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const questions = [
      q("u1", "S1_q1", "S1", 1, { isInherited: true }),
      q("u2", "S1_q2", "S1", 2),
      q("u3", "S2_q3", "S2", 1),
    ];
    const { result, moveQuestionToSection, setFocusedQuestionUid } =
      renderCommands({ questions });

    act(() => {
      result.current.moveQuestion("u1", "S2");
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(moveQuestionToSection).not.toHaveBeenCalled();
    expect(setFocusedQuestionUid).not.toHaveBeenCalled();
  });

  it("forwards an explicit target index to the model command", () => {
    const { result, moveQuestionToSection } = renderCommands();

    act(() => {
      result.current.moveQuestion("u1", "S2", 0);
    });

    expect(moveQuestionToSection).toHaveBeenCalledWith("u1", "S2", 0);
  });
});

describe("useEditorCommands — consumePendingFocus + stability", () => {
  it("consumePendingFocus clears the target (second read is null)", () => {
    const { result, duplicateQuestion } = renderCommands();
    void duplicateQuestion;

    act(() => {
      result.current.duplicateQuestion("u1");
    });

    expect(result.current.consumePendingFocus()).toEqual({
      kind: "row",
      uid: "u-copy",
    });
    // Consumed — a second read yields null.
    expect(result.current.consumePendingFocus()).toBeNull();
  });

  it("returns a referentially STABLE handler object across renders", () => {
    const built = buildModel();
    const { result, rerender } = renderHook(
      (props: { conditionalEnabled: boolean }) =>
        useEditorCommands(built.model, {
          conditionalEnabled: props.conditionalEnabled,
          isReadOnly: false,
          isUnlocked: true,
        }),
      { initialProps: { conditionalEnabled: true } },
    );
    const first = result.current;
    rerender({ conditionalEnabled: false });
    expect(result.current).toBe(first);
    expect(result.current.deleteQuestion).toBe(first.deleteQuestion);
  });
});
