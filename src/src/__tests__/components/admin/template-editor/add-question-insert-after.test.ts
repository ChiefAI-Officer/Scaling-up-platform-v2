/**
 * Wave ED6 (co-validate C4) — `addQuestion` optional insert-after index.
 *
 * The single-column builder inserts a new question BELOW the focused card, so
 * `addQuestion` gained an optional `{ afterUid }` — WITHOUT changing the
 * append default (the "verbatim reuse" claim in the plan was false here).
 *
 * The append path is pinned byte-for-byte by the FROZEN `question-commands`
 * suite (do NOT edit it); this sibling file adds ONLY the new insert-after
 * behavior + a couple of append-fallback regressions, so the frozen count
 * stays at 30.
 */

import { renderHook, act } from "@testing-library/react";

import { useTemplateEditorDraft } from "@/components/admin/template-editor/hooks/useTemplateEditorDraft";

const toastMock = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

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

describe("useTemplateEditorDraft — addQuestion insert-after (ED6 C4)", () => {
  it("inserts immediately AFTER afterUid within the section and resequences sortOrder 1-based", () => {
    const { result } = renderDraft();
    const gate = result.current.questions.find((q) => q.stableKey === "S1_gate")!;
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;
    expect(gate.sortOrder).toBe(1);
    expect(dep.sortOrder).toBe(2);

    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1", { afterUid: gate.uid });
    });

    expect(typeof newUid).toBe("string");
    expect(newUid.length).toBeGreaterThan(0);

    const s1 = result.current.questions
      .filter((q) => q.sectionStableKey === "S1")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(s1.map((q) => q.uid)).toEqual([gate.uid, newUid, dep.uid]);
    expect(s1.map((q) => q.sortOrder)).toEqual([1, 2, 3]);
    expect(result.current.dirtyFlags.questions).toBe(true);
  });

  it("inserting after the LAST question puts the new row last with a contiguous sortOrder", () => {
    const { result } = renderDraft();
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;
    const gate = result.current.questions.find((q) => q.stableKey === "S1_gate")!;

    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1", { afterUid: dep.uid });
    });

    const s1 = result.current.questions
      .filter((q) => q.sectionStableKey === "S1")
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(s1.map((q) => q.uid)).toEqual([gate.uid, dep.uid, newUid]);
    expect(s1.map((q) => q.sortOrder)).toEqual([1, 2, 3]);
  });

  it("with NO opts APPENDS exactly as before: new row at end, existing sortOrders untouched, returns the new uid", () => {
    const { result } = renderDraft();
    const gate = result.current.questions.find((q) => q.stableKey === "S1_gate")!;
    const dep = result.current.questions.find((q) => q.stableKey === "S1_dep")!;

    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1");
    });

    expect(typeof newUid).toBe("string");
    expect(newUid.length).toBeGreaterThan(0);
    const added = result.current.questions.find((q) => q.uid === newUid)!;
    expect(added.sectionStableKey).toBe("S1");
    expect(added.sortOrder).toBe(3);
    // Existing rows untouched (append never resequences).
    expect(result.current.questions.find((q) => q.uid === gate.uid)!.sortOrder).toBe(1);
    expect(result.current.questions.find((q) => q.uid === dep.uid)!.sortOrder).toBe(2);
    // Appended at the end of the flat list.
    expect(
      result.current.questions[result.current.questions.length - 1].uid,
    ).toBe(newUid);
  });

  it("with afterUid absent in the opts object APPENDS", () => {
    const { result } = renderDraft();
    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1", {});
    });
    const added = result.current.questions.find((q) => q.uid === newUid)!;
    expect(added.sortOrder).toBe(3);
    expect(
      result.current.questions[result.current.questions.length - 1].uid,
    ).toBe(newUid);
  });

  it("falls back to APPEND when afterUid is not a question in that section", () => {
    const { result } = renderDraft();
    let newUid = "";
    act(() => {
      newUid = result.current.addQuestion("S1", { afterUid: "does-not-exist" });
    });
    const added = result.current.questions.find((q) => q.uid === newUid)!;
    expect(added.sortOrder).toBe(3);
    expect(
      result.current.questions[result.current.questions.length - 1].uid,
    ).toBe(newUid);
  });
});
