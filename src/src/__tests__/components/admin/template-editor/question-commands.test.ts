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
  buildSectionDeletePrompt,
  buildShowIfDependentsWarning,
  computeSurvivorFocus,
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

// ED5 Task 10 (B-2b) — two sections, with a cross-section show-if AND an
// in-section show-if, so `deleteSection` can be pinned on the distinction
// between "external dependent" (cleared, reported) and "in-section
// dependent" (just removed along with its gate — never reported).
function makeVersionWithTwoSections() {
  return {
    id: "ver_3",
    versionNumber: 3,
    language: "en-US",
    publishedAt: null as string | null,
    contentHash: "abcdef012345",
    sections: [
      { stableKey: "S1", name: "Section One" },
      { stableKey: "S2", name: "Section Two" },
    ],
    questions: [
      {
        stableKey: "S1_a",
        sectionStableKey: "S1",
        label: "Gate",
        type: "MULTI_CHOICE",
        isRequired: true,
        sortOrder: 1,
        options: [{ key: "a", label: "Alpha" }],
        maxChoices: 1,
      },
      {
        stableKey: "S1_b",
        sectionStableKey: "S1",
        label: "In-section dependent",
        type: "TEXT",
        isRequired: false,
        sortOrder: 2,
        showIf: { questionKey: "S1_a", optionKey: "a" },
      },
      {
        stableKey: "S2_x",
        sectionStableKey: "S2",
        label: "External dependent",
        type: "TEXT",
        isRequired: false,
        sortOrder: 1,
        showIf: { questionKey: "S1_a", optionKey: "a" },
      },
    ],
    scoringConfig: {},
    reportConfig: null,
  };
}

function renderDraftTwoSections() {
  return renderHook(() =>
    useTemplateEditorDraft({
      template,
      version: makeVersionWithTwoSections(),
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

// ── Aggregated section-delete prompt (ED5 Task 10, B-2b) ───────────────────
describe("buildSectionDeletePrompt", () => {
  it("empty section = simple prompt, no count/consequence/dependents lines", () => {
    const prompt = buildSectionDeletePrompt(
      { name: "Intro", stableKey: "S1" },
      {
        questionCount: 0,
        inheritedKeys: [],
        freedDependentKeys: [],
        isUnlocked: true,
      },
    );
    expect(prompt).toBe("Delete section S1?");
  });

  it("non-empty section names the count, enumerates inherited keys with consequence language, and names freed dependents", () => {
    const prompt = buildSectionDeletePrompt(
      { name: "Recruit", stableKey: "S3" },
      {
        questionCount: 3,
        inheritedKeys: ["S3_a", "S3_b"],
        freedDependentKeys: ["S5_why"],
        isUnlocked: true,
      },
    );
    expect(prompt).toContain("Delete section S3 and its 3 questions?");
    expect(prompt).toContain("S3_a, S3_b");
    expect(prompt).toContain("trend");
    expect(prompt).toContain("S5_why");
    expect(prompt).toContain("Continue?");
  });

  it("singular question count uses the singular noun", () => {
    const prompt = buildSectionDeletePrompt(
      { name: "Solo", stableKey: "S4" },
      {
        questionCount: 1,
        inheritedKeys: [],
        freedDependentKeys: [],
        isUnlocked: true,
      },
    );
    expect(prompt).toContain("Delete section S4 and its 1 question?");
  });

  it("inherited keys are NOT enumerated when isUnlocked is false", () => {
    const prompt = buildSectionDeletePrompt(
      { name: "Recruit", stableKey: "S3" },
      {
        questionCount: 2,
        inheritedKeys: ["S3_a"],
        freedDependentKeys: [],
        isUnlocked: false,
      },
    );
    expect(prompt).not.toContain("published version");
    expect(prompt).not.toContain("S3_a");
  });

  it("freed dependents are named even when there are no inherited keys", () => {
    const prompt = buildSectionDeletePrompt(
      { name: "Recruit", stableKey: "S3" },
      {
        questionCount: 1,
        inheritedKeys: [],
        freedDependentKeys: ["S5_why", "S5_other"],
        isUnlocked: true,
      },
    );
    expect(prompt).toContain(
      "2 questions shown conditionally on deleted questions will become always-visible: S5_why, S5_other.",
    );
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

// ── deleteSection — cascade command (ED5 Task 10, B-2b) ────────────────────
describe("useTemplateEditorDraft — deleteSection", () => {
  it("removes the section + its questions atomically, clears the EXTERNAL dependent's showIf, and does NOT report the in-section dependent as affected", () => {
    const { result } = renderDraftTwoSections();
    const s1 = result.current.sections.find((s) => s.stableKey === "S1")!;
    const gate = result.current.questions.find((q) => q.stableKey === "S1_a")!;
    const inSectionDep = result.current.questions.find(
      (q) => q.stableKey === "S1_b",
    )!;
    const externalDep = result.current.questions.find(
      (q) => q.stableKey === "S2_x",
    )!;
    expect(externalDep.showIf).toEqual({ questionKey: "S1_a", optionKey: "a" });

    let res:
      | {
          removedSectionKey: string;
          removedQuestionUids: string[];
          affectedDependentUids: string[];
        }
      | undefined;
    act(() => {
      res = result.current.deleteSection(s1.uid);
    });

    expect(res!.removedSectionKey).toBe("S1");
    expect(new Set(res!.removedQuestionUids)).toEqual(
      new Set([gate.uid, inSectionDep.uid]),
    );
    // The in-section dependent is removed too — it must NOT show up as an
    // "affected" (survives-with-cleared-showIf) dependent.
    expect(res!.affectedDependentUids).toEqual([externalDep.uid]);

    // Section physically removed (atomic with the questions below).
    expect(result.current.sections.map((s) => s.stableKey)).toEqual(["S2"]);

    // Both S1 questions gone.
    expect(
      result.current.questions.some((q) => q.stableKey === "S1_a"),
    ).toBe(false);
    expect(
      result.current.questions.some((q) => q.stableKey === "S1_b"),
    ).toBe(false);

    // External dependent survives with showIf CLEARED.
    const externalAfter = result.current.questions.find(
      (q) => q.stableKey === "S2_x",
    )!;
    expect(externalAfter).toBeDefined();
    expect(externalAfter.showIf).toBeNull();

    // Both surfaces flagged dirty by the one atomic handler.
    expect(result.current.dirtyFlags.sections).toBe(true);
    expect(result.current.dirtyFlags.questions).toBe(true);
  });

  it("an empty section deletes cleanly with no removed questions and no affected dependents", () => {
    const { result } = renderDraft(); // single-section S1 fixture
    act(() => {
      result.current.handleSectionsAdd(); // adds an empty S2-ish section
    });
    const empty = result.current.sections.find((s) => s.stableKey !== "S1")!;
    let res:
      | {
          removedSectionKey: string;
          removedQuestionUids: string[];
          affectedDependentUids: string[];
        }
      | undefined;
    act(() => {
      res = result.current.deleteSection(empty.uid);
    });
    expect(res).toEqual({
      removedSectionKey: empty.stableKey,
      removedQuestionUids: [],
      affectedDependentUids: [],
    });
    expect(
      result.current.sections.some((s) => s.uid === empty.uid),
    ).toBe(false);
  });
});

// ── computeSurvivorFocus (ED5 Task 5, audit C — focus rule) ────────────────
describe("computeSurvivorFocus", () => {
  const sectionOrder = ["S1", "S2"];

  it("next-in-section — prefers the next sibling by sortOrder", () => {
    const q1 = draftQuestion({ uid: "q1", sectionStableKey: "S1", sortOrder: 1 });
    const q2 = draftQuestion({ uid: "q2", sectionStableKey: "S1", sortOrder: 2 });
    const q3 = draftQuestion({ uid: "q3", sectionStableKey: "S1", sortOrder: 3 });
    expect(computeSurvivorFocus([q1, q2, q3], sectionOrder, "q1")).toBe("q2");
  });

  it("last→previous — removing the last sibling in a section focuses the previous one", () => {
    const q1 = draftQuestion({ uid: "q1", sectionStableKey: "S1", sortOrder: 1 });
    const q2 = draftQuestion({ uid: "q2", sectionStableKey: "S1", sortOrder: 2 });
    expect(computeSurvivorFocus([q1, q2], sectionOrder, "q2")).toBe("q1");
  });

  it("section-empties→nearest section — falls through to the next section in order when the target's section has no survivors left", () => {
    const q1 = draftQuestion({ uid: "q1", sectionStableKey: "S1", sortOrder: 1 });
    const q2 = draftQuestion({ uid: "q2", sectionStableKey: "S2", sortOrder: 1 });
    const q3 = draftQuestion({ uid: "q3", sectionStableKey: "S2", sortOrder: 2 });
    expect(computeSurvivorFocus([q1, q2, q3], sectionOrder, "q1")).toBe("q2");
  });

  it("template-empty→null — removing the only remaining question returns null", () => {
    const q1 = draftQuestion({ uid: "q1", sectionStableKey: "S1", sortOrder: 1 });
    expect(computeSurvivorFocus([q1], sectionOrder, "q1")).toBeNull();
  });

  it("cascade (alsoRemoved) — skips also-removed questions when picking the next survivor", () => {
    const q1 = draftQuestion({ uid: "q1", sectionStableKey: "S1", sortOrder: 1 });
    const q2 = draftQuestion({ uid: "q2", sectionStableKey: "S1", sortOrder: 2 });
    const q3 = draftQuestion({ uid: "q3", sectionStableKey: "S1", sortOrder: 3 });
    // q2 would normally be the "next" survivor, but it's also being removed
    // in the same cascade — the helper must skip it and land on q3.
    expect(
      computeSurvivorFocus([q1, q2, q3], sectionOrder, "q1", ["q2"]),
    ).toBe("q3");
  });
});
