/**
 * Wave ED4 (spec 19af §3.4), Task 1 — shared question commands.
 *
 * The three-pane outline (W4) must run every question mutation through the
 * SAME model commands `QuestionsTab` uses, so it can't bypass the show-if
 * dependent cleanup or the delete-confirm/warn text (co-validate C2). This
 * suite pins:
 *   - the shared, exported text builders (byte-identical to the strings that
 *     lived inline in `QuestionsTab` before the lift — snapshotted here);
 *   - the shared `findShowIfDependents` discovery predicate;
 *   - the model commands `addQuestion`/`duplicateQuestion` return a NEW uid,
 *     and `deleteQuestion` returns `{ removedUid, affectedDependentUids }`
 *     AND clears the dependents' `showIf` in the resulting `questions`.
 */

import { renderHook, act } from "@testing-library/react";

import {
  buildDeleteConfirmText,
  buildShowIfDependentsWarning,
  findShowIfDependents,
} from "@/components/admin/template-editor/question-commands";
import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";
import type { QuestionDraft } from "@/components/admin/template-editor/QuestionsTab";

// ── Mocks (the hook reads useToast + useRouter at the top) ────────────────
const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────
function makeVersion() {
  return {
    id: "ver_2",
    versionNumber: 2,
    language: "en-US",
    publishedAt: null as string | null,
    contentHash: "abcdef012345",
    sections: [{ stableKey: "S1", name: "Section One" }],
    questions: [
      {
        stableKey: "S1_gate",
        sectionStableKey: "S1",
        label: "Gate",
        type: "MULTI_CHOICE",
        isRequired: true,
        sortOrder: 1,
        options: [{ key: "a", label: "Alpha" }],
        maxChoices: 1,
      },
      {
        stableKey: "S1_dep",
        sectionStableKey: "S1",
        label: "Dependent",
        type: "TEXT",
        isRequired: false,
        sortOrder: 2,
        showIf: { questionKey: "S1_gate", optionKey: "a" },
      },
    ],
    scoringConfig: {},
    reportConfig: null,
  };
}

const template = {
  id: "tpl_1",
  name: "Alpha",
  alias: "ALPHA",
  aggregationMode: "FULL_VISIBILITY" as const,
  accessMode: "INVITED" as const,
};

function renderDraft() {
  return renderHook(() =>
    useTemplateEditorDraft({
      template,
      version: makeVersion(),
      publishedQuestionKeys: [],
      publishedOptionKeys: {},
      questionEditorUnlocked: true,
      waveQEnabled: false,
    }),
  );
}

function draftQuestion(overrides: Partial<QuestionDraft>): QuestionDraft {
  return {
    uid: "u_default",
    stableKey: "S1_x",
    sectionStableKey: "S1",
    label: "X",
    helpText: "",
    isRequired: false,
    type: "TEXT",
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

// ── Text builders — byte-identical to the pre-lift QuestionsTab copies ────
describe("shared text builders", () => {
  it("buildDeleteConfirmText matches the pre-lift inherited-delete string", () => {
    expect(buildDeleteConfirmText(draftQuestion({ stableKey: "S1_gate" }))).toBe(
      [
        "Delete inherited question S1_gate?",
        "",
        "This question exists in a published version of this template. Deleting it means:",
        "• cross-version trend history for S1_gate ends with the last published version;",
        "• a locked Esperto import crosswalk that maps this key will refuse imports against the next published version;",
        "• any peer benchmark set on this question will be pruned.",
        "",
        "Continue?",
      ].join("\n"),
    );
  });

  it("buildShowIfDependentsWarning is empty for zero keys", () => {
    expect(buildShowIfDependentsWarning([])).toBe("");
  });

  it("buildShowIfDependentsWarning is singular for one key", () => {
    expect(buildShowIfDependentsWarning(["S1_dep"])).toBe(
      "\n1 question shown conditionally on this one will become always-visible: S1_dep.",
    );
  });

  it("buildShowIfDependentsWarning is plural + comma-joined for many keys", () => {
    expect(buildShowIfDependentsWarning(["S1_dep", "S1_dep2"])).toBe(
      "\n2 questions shown conditionally on this one will become always-visible: S1_dep, S1_dep2.",
    );
  });
});

// ── Shared discovery predicate ────────────────────────────────────────────
describe("findShowIfDependents", () => {
  it("returns questions whose showIf references the gate stableKey (excluding the gate)", () => {
    const gate = draftQuestion({ uid: "g", stableKey: "S1_gate", type: "MULTI_CHOICE" });
    const dep = draftQuestion({
      uid: "d",
      stableKey: "S1_dep",
      showIf: { questionKey: "S1_gate", optionKey: "a" },
    });
    const other = draftQuestion({ uid: "o", stableKey: "S1_other" });
    expect(findShowIfDependents([gate, dep, other], gate).map((q) => q.uid)).toEqual([
      "d",
    ]);
  });

  it("returns [] for a gate with a blank stableKey (can't be referenced yet)", () => {
    const gate = draftQuestion({ uid: "g", stableKey: "", type: "MULTI_CHOICE" });
    const dep = draftQuestion({
      uid: "d",
      stableKey: "S1_dep",
      showIf: { questionKey: "", optionKey: "a" },
    });
    expect(findShowIfDependents([gate, dep], gate)).toEqual([]);
  });
});

// ── Model commands ─────────────────────────────────────────────────────────
describe("useTemplateEditorDraft — question commands", () => {
  it("addQuestion returns a NEW uid not previously present, added to the section", () => {
    const { result } = renderDraft();
    const before = new Set(result.current.questions.map((q) => q.uid));
    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1");
    });
    expect(typeof newUid).toBe("string");
    expect(newUid.length).toBeGreaterThan(0);
    expect(before.has(newUid)).toBe(false);
    const added = result.current.questions.find((q) => q.uid === newUid);
    expect(added).toBeDefined();
    expect(added!.sectionStableKey).toBe("S1");
    expect(result.current.dirtyFlags.questions).toBe(true);
  });

  it("duplicateQuestion returns the copy's NEW uid", () => {
    const { result } = renderDraft();
    const src = result.current.questions.find((q) => q.stableKey === "S1_gate")!;
    const before = new Set(result.current.questions.map((q) => q.uid));
    let newUid = "";
    act(() => {
      newUid = result.current.duplicateQuestion(src.uid);
    });
    expect(newUid).not.toBe(src.uid);
    expect(before.has(newUid)).toBe(false);
    expect(result.current.questions.some((q) => q.uid === newUid)).toBe(true);
  });

  it("deleteQuestion returns { removedUid, affectedDependentUids } and clears dependents' showIf", () => {
    const { result } = renderDraft();
    const gate = result.current.questions.find((q) => q.stableKey === "S1_gate")!;
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;
    expect(dep.showIf).toEqual({ questionKey: "S1_gate", optionKey: "a" });

    let res: { removedUid: string; affectedDependentUids: string[] } | undefined;
    act(() => {
      res = result.current.deleteQuestion(gate.uid);
    });

    expect(res).toEqual({
      removedUid: gate.uid,
      affectedDependentUids: [dep.uid],
    });
    expect(result.current.questions.some((q) => q.uid === gate.uid)).toBe(false);
    const depAfter = result.current.questions.find((q) => q.uid === dep.uid)!;
    expect(depAfter.showIf).toBeNull();
  });

  it("deleteQuestion of a question with no dependents returns an empty affected list", () => {
    const { result } = renderDraft();
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;
    let res: { removedUid: string; affectedDependentUids: string[] } | undefined;
    act(() => {
      res = result.current.deleteQuestion(dep.uid);
    });
    expect(res).toEqual({ removedUid: dep.uid, affectedDependentUids: [] });
    expect(result.current.questions.some((q) => q.uid === dep.uid)).toBe(false);
  });

  it("reorderQuestions applies the swapped sortOrder within the section", () => {
    const { result } = renderDraft();
    const gate = result.current.questions.find((q) => q.stableKey === "S1_gate")!;
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;
    act(() => {
      result.current.reorderQuestions("S1", [dep.uid, gate.uid]);
    });
    const gateAfter = result.current.questions.find((q) => q.uid === gate.uid)!;
    const depAfter = result.current.questions.find((q) => q.uid === dep.uid)!;
    expect(depAfter.sortOrder).toBe(1);
    expect(gateAfter.sortOrder).toBe(2);
  });
});
