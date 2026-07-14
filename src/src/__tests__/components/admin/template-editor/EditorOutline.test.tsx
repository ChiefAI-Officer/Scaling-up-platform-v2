/**
 * ED4 (spec 19af §3.3 left pane / §3.4 shared commands + focus policy),
 * Task 4 — EditorOutline unit tests.
 *
 * The outline renders a nested section→question tree, routes every mutation
 * through the SHARED model commands (so it can't bypass the show-if dependent
 * cleanup), and enforces the G10 focus policy. jsdom can NOT drive dnd-kit's
 * PointerSensor (real PointerEvents are unavailable — see the ED3 byte-
 * equivalence guard, which drives reorder via the KEYBOARD sensor for the same
 * reason). Both sensors call the identical `onDragEnd` → `onReorderQuestions`
 * path, so the keyboard sequence exercises the reorder contract; the pointer
 * affordance is asserted structurally.
 */

import React, { useState } from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";

import { EditorOutline } from "@/components/admin/template-editor/EditorOutline";
import { useEditorSelection } from "@/components/admin/template-editor/hooks/useEditorSelection";
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
afterEach(() => cleanup());

// ── @dnd-kit keyboard-reorder enablement (jsdom has no layout) ──────────────
// Verbatim from editor-byte-equivalence.test.tsx: give each question-card <li>
// a distinct vertical slot by its index among sibling cards, polyfill
// ResizeObserver, and use fake timers (dnd-kit schedules the keyboard move on a
// timer). This is the only way to drive a REAL reorder at the public surface.
function installDndLayout(): () => void {
  const origRect = Element.prototype.getBoundingClientRect;
  const hadRO = "ResizeObserver" in globalThis;
  const origRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement;
    const tid = el.getAttribute?.("data-testid") ?? "";
    if (tid.startsWith("question-card-")) {
      const parent = el.parentElement;
      const sibs = parent
        ? Array.from(parent.children).filter((c) =>
            (c.getAttribute("data-testid") ?? "").startsWith("question-card-"),
          )
        : [el];
      const top = sibs.indexOf(el) * 60;
      return {
        top,
        bottom: top + 50,
        left: 0,
        right: 200,
        width: 200,
        height: 50,
        x: 0,
        y: top,
        toJSON() {},
      } as DOMRect;
    }
    return {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = origRect;
    if (hadRO) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = origRO;
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  };
}

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
  return [q("u1", "S1_q1", "S1", 1), q("u2", "S1_q2", "S1", 2), q("u3", "S2_q3", "S2", 1)];
}

interface HarnessOverrides {
  sections?: SectionDraft[];
  questions?: QuestionDraftRow[];
  isReadOnly?: boolean;
  isUnlocked?: boolean;
  conditionalEnabled?: boolean;
  initialFocus?: string | null;
  onAddQuestion?: (sectionKey: string) => string;
  onDuplicateQuestion?: (uid: string) => string;
  onDeleteQuestion?: (uid: string) => {
    removedUid: string;
    affectedDependentUids: string[];
  };
  onReorderQuestions?: (sectionKey: string, order: string[]) => void;
  onGoToSections?: () => void;
  setFocusedSpy?: jest.Mock;
}

function renderOutline(o: HarnessOverrides = {}) {
  const setFocusedSpy = o.setFocusedSpy ?? jest.fn();
  function Harness() {
    const [focused, setFocused] = useState<string | null>(
      o.initialFocus ?? null,
    );
    const set = (uid: string | null) => {
      setFocusedSpy(uid);
      setFocused(uid);
    };
    // Questions live in state (not a fixed prop) so add/duplicate/delete
    // reflect into the rendered tree exactly like the real model does —
    // required for the ED5 Task 5 DOM-focus tests, which need the
    // survivor/new row to actually exist in the DOM after a mutation.
    const [questions, setQuestions] = useState<QuestionDraftRow[]>(
      o.questions ?? baseQuestions(),
    );
    // Collapse slice — model-backed in production (useEditorSelection); a
    // plain local useState here stands in for it (the outline itself no
    // longer owns this state — ED5 Task 3).
    const [collapsedSections, setCollapsedSections] = useState<
      Record<string, boolean>
    >({});
    const isSectionCollapsed = (key: string) => !!collapsedSections[key];
    const toggleSectionCollapsed = (key: string) =>
      setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
    const setSectionCollapsed = (key: string, collapsed: boolean) =>
      setCollapsedSections((prev) => ({ ...prev, [key]: collapsed }));

    const handleAddQuestion = (sectionKey: string): string => {
      const impl = o.onAddQuestion ?? (() => "u-new");
      const newUid = impl(sectionKey);
      setQuestions((prev) => [
        ...prev,
        q(
          newUid,
          "",
          sectionKey,
          prev.filter((x) => x.sectionStableKey === sectionKey).length + 1,
        ),
      ]);
      return newUid;
    };

    const handleDuplicateQuestion = (uid: string): string => {
      const impl = o.onDuplicateQuestion ?? (() => "u-copy");
      const newUid = impl(uid);
      const src = questions.find((x) => x.uid === uid);
      const sectionKey = src?.sectionStableKey ?? "S1";
      setQuestions((prev) => [
        ...prev,
        q(
          newUid,
          "",
          sectionKey,
          prev.filter((x) => x.sectionStableKey === sectionKey).length + 1,
        ),
      ]);
      return newUid;
    };

    const handleDeleteQuestion = (
      uid: string,
    ): { removedUid: string; affectedDependentUids: string[] } => {
      const impl =
        o.onDeleteQuestion ??
        ((u: string) => ({ removedUid: u, affectedDependentUids: [] }));
      const res = impl(uid);
      setQuestions((prev) => prev.filter((x) => x.uid !== res.removedUid));
      return res;
    };

    return (
      <EditorOutline
        sections={o.sections ?? SECTIONS}
        questions={questions}
        focusedQuestionUid={focused}
        setFocusedQuestionUid={set}
        isReadOnly={o.isReadOnly ?? false}
        isUnlocked={o.isUnlocked ?? true}
        conditionalEnabled={o.conditionalEnabled ?? true}
        isSectionCollapsed={isSectionCollapsed}
        toggleSectionCollapsed={toggleSectionCollapsed}
        setSectionCollapsed={setSectionCollapsed}
        onAddQuestion={handleAddQuestion}
        onDuplicateQuestion={handleDuplicateQuestion}
        onDeleteQuestion={handleDeleteQuestion}
        onReorderQuestions={o.onReorderQuestions ?? jest.fn()}
        onGoToSections={o.onGoToSections ?? jest.fn()}
      />
    );
  }
  return { setFocusedSpy, ...render(<Harness />) };
}

// ════════════════════════════════════════════════════════════════════════
describe("EditorOutline — nested tree", () => {
  it("renders sections as headers with their questions nested (type chip + label)", () => {
    renderOutline();

    // Section headers.
    expect(screen.getByTestId("outline-section-S1")).toBeInTheDocument();
    expect(screen.getByTestId("outline-section-S2")).toBeInTheDocument();

    // Questions nested UNDER their section (not a flat list).
    const s1 = screen.getByTestId("outline-section-S1");
    expect(within(s1).getByTestId("question-card-S1_q1")).toBeInTheDocument();
    expect(within(s1).getByTestId("question-card-S1_q2")).toBeInTheDocument();
    expect(within(s1).queryByTestId("question-card-S2_q3")).toBeNull();

    const s2 = screen.getByTestId("outline-section-S2");
    expect(within(s2).getByTestId("question-card-S2_q3")).toBeInTheDocument();

    // Type chip + label present on a row.
    const row = screen.getByTestId("question-card-S1_q1");
    expect(within(row).getByText("SLIDER_LIKERT")).toBeInTheDocument();
    expect(within(row).getByText("S1_q1 label")).toBeInTheDocument();
  });

  it("collapsing a section header hides its question rows (questions-only focus)", () => {
    const setFocusedSpy = jest.fn();
    renderOutline({ setFocusedSpy });

    expect(screen.getByTestId("question-card-S1_q1")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId("outline-section-toggle-S1"));
    });
    expect(screen.queryByTestId("question-card-S1_q1")).toBeNull();
    // Toggling the header never focuses a question.
    expect(setFocusedSpy).not.toHaveBeenCalled();
  });
});

describe("EditorOutline — focus", () => {
  it("clicking a row focuses that question (aria-current)", () => {
    const { setFocusedSpy } = renderOutline();

    act(() => {
      fireEvent.click(screen.getByTestId("outline-focus-S1_q2"));
    });
    expect(setFocusedSpy).toHaveBeenCalledWith("u2");
    expect(screen.getByTestId("question-card-S1_q2")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("question-card-S1_q1")).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("EditorOutline — add / duplicate (focus the returned uid)", () => {
  it("+ Add question calls onAddQuestion(sectionKey) and focuses the returned uid", () => {
    const onAddQuestion = jest.fn(() => "u-added");
    const { setFocusedSpy } = renderOutline({ onAddQuestion });

    act(() => {
      fireEvent.click(screen.getByTestId("outline-add-question-S2"));
    });
    expect(onAddQuestion).toHaveBeenCalledWith("S2");
    expect(setFocusedSpy).toHaveBeenCalledWith("u-added");
  });

  it("Duplicate calls onDuplicateQuestion(uid) and focuses the returned copy uid", () => {
    const onDuplicateQuestion = jest.fn(() => "u-dup");
    const { setFocusedSpy } = renderOutline({ onDuplicateQuestion });

    const row = screen.getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Duplicate" }));
    });
    expect(onDuplicateQuestion).toHaveBeenCalledWith("u1");
    expect(setFocusedSpy).toHaveBeenCalledWith("u-dup");
  });
});

describe("EditorOutline — delete (shared confirm, focus neighbor, dependents)", () => {
  it("Delete of the focused gate → shared confirm names dependents, focus moves to the next sibling, onDeleteQuestion called", () => {
    const onDeleteQuestion = jest.fn((uid: string) => ({
      removedUid: uid,
      affectedDependentUids: ["u2"],
    }));
    // S1_q2 is shown conditionally on S1_q1 (the gate being deleted).
    const questions = [
      q("u1", "S1_q1", "S1", 1),
      q("u2", "S1_q2", "S1", 2, {
        showIf: { questionKey: "S1_q1", optionKey: "a" },
      }),
      q("u3", "S2_q3", "S2", 1),
    ];
    const { setFocusedSpy } = renderOutline({
      questions,
      onDeleteQuestion,
      initialFocus: "u1", // deleting the FOCUSED question
    });

    const row = screen.getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });

    // Shared prompt: non-inherited base line + the dependents warning naming S1_q2.
    const promptText = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(promptText).toContain("Delete question S1_q1?");
    expect(promptText).toContain("S1_q2");

    // Bypass-proof: the consolidated command runs (it clears dependents).
    expect(onDeleteQuestion).toHaveBeenCalledWith("u1");
    // Focus policy: focus the NEXT in-section sibling (S1_q2 → u2).
    expect(setFocusedSpy).toHaveBeenCalledWith("u2");
  });

  it("canceling the confirm makes no delete + no focus change", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const onDeleteQuestion = jest.fn((uid: string) => ({
      removedUid: uid,
      affectedDependentUids: [],
    }));
    const { setFocusedSpy } = renderOutline({
      onDeleteQuestion,
      initialFocus: "u1",
    });
    const row = screen.getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });
    expect(onDeleteQuestion).not.toHaveBeenCalled();
    expect(setFocusedSpy).not.toHaveBeenCalled();
  });

  it("deleting the LAST focused question in a section focuses the previous sibling", () => {
    const { setFocusedSpy } = renderOutline({ initialFocus: "u2" }); // S1_q2 is last in S1
    const row = screen.getByTestId("question-card-S1_q2");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });
    // Prev sibling S1_q1 → u1.
    expect(setFocusedSpy).toHaveBeenCalledWith("u1");
  });

  it("deleting a NON-focused question leaves focus unchanged", () => {
    const { setFocusedSpy } = renderOutline({ initialFocus: "u1" });
    const row = screen.getByTestId("question-card-S1_q2"); // delete the non-focused one
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });
    expect(setFocusedSpy).not.toHaveBeenCalled();
  });
});

describe("EditorOutline — within-section reorder", () => {
  it("keyboard reorder calls onReorderQuestions(sectionKey, swappedOrder); focus unchanged", () => {
    const restoreDnd = installDndLayout();
    jest.useFakeTimers();
    const onReorderQuestions = jest.fn();
    try {
      const { setFocusedSpy } = renderOutline({ onReorderQuestions });

      // Lift S1_q1 (Space), move down (ArrowDown), drop (Space).
      const handle = screen.getByTestId("drag-handle-S1_q1");
      act(() => {
        handle.focus();
      });
      act(() => {
        fireEvent.keyDown(handle, { key: " ", code: "Space" });
        jest.runOnlyPendingTimers();
      });
      act(() => {
        fireEvent.keyDown(document, { key: "ArrowDown", code: "ArrowDown" });
        jest.runOnlyPendingTimers();
      });
      act(() => {
        fireEvent.keyDown(document, { key: " ", code: "Space" });
        jest.runOnlyPendingTimers();
      });

      expect(onReorderQuestions).toHaveBeenCalledTimes(1);
      expect(onReorderQuestions).toHaveBeenCalledWith("S1", ["u2", "u1"]);
      // Reorder never moves focus (G10).
      expect(setFocusedSpy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      restoreDnd();
    }
  });

  it("wires a pointer drag affordance (each row is a sortable draggable handle)", () => {
    renderOutline();
    // The PointerSensor is wired (production drag path); jsdom cannot dispatch
    // real PointerEvents, so this asserts the affordance is present + enabled.
    const handle = screen.getByTestId("drag-handle-S1_q1");
    expect(handle).toBeEnabled();
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
  });
});

describe("EditorOutline — empty state (G9)", () => {
  it("zero sections → empty message + a control that switches to the Sections tab", () => {
    const onGoToSections = jest.fn();
    renderOutline({ sections: [], questions: [], onGoToSections });

    expect(screen.getByTestId("editor-outline-empty")).toHaveTextContent(
      /No sections yet — add one in the Sections tab/i,
    );
    act(() => {
      fireEvent.click(screen.getByTestId("editor-outline-go-to-sections"));
    });
    expect(onGoToSections).toHaveBeenCalledTimes(1);
  });
});

describe("EditorOutline — read-only (G4)", () => {
  it("published version disables add/duplicate/delete/drag; rows still focusable", () => {
    const { setFocusedSpy } = renderOutline({ isReadOnly: true });

    expect(screen.getByTestId("outline-add-question-S1")).toBeDisabled();
    const row = screen.getByTestId("question-card-S1_q1");
    expect(within(row).getByRole("button", { name: "Duplicate" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByTestId("drag-handle-S1_q1")).toBeDisabled();

    // Rows remain navigable (focus allowed while read-only).
    act(() => {
      fireEvent.click(screen.getByTestId("outline-focus-S1_q1"));
    });
    expect(setFocusedSpy).toHaveBeenCalledWith("u1");
  });
});

describe("EditorOutline — DOM focus/scroll after mutation (ED5 Task 5, audit C — focus rule)", () => {
  /**
   * The model-focus policy above (G10) only ever moved
   * `focusedQuestionUid` — it never moved real DOM keyboard focus or
   * scrolled the row into view, so a keyboard/screen-reader user's focus
   * could be silently dropped (delete → focus falls back to the page) or
   * left behind (add/duplicate → the new row is off-screen, unfocused).
   * These tests drive the real mutation path (the harness reflects
   * add/duplicate/delete into its `questions` state, like the production
   * model does) and assert `document.activeElement` actually lands on the
   * new/survivor row's focus button.
   */
  it("after Add, DOM focus moves to the new row's focus button", () => {
    const onAddQuestion = jest.fn(() => "u-added");
    renderOutline({ onAddQuestion });

    act(() => {
      fireEvent.click(screen.getByTestId("outline-add-question-S2"));
    });

    const newRowFocusBtn = screen.getByTestId("outline-focus-u-added");
    expect(document.activeElement).toBe(newRowFocusBtn);
  });

  it("after Duplicate, DOM focus moves to the copy row's focus button", () => {
    const onDuplicateQuestion = jest.fn(() => "u-dup");
    renderOutline({ onDuplicateQuestion });

    const row = screen.getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Duplicate" }));
    });

    const copyRowFocusBtn = screen.getByTestId("outline-focus-u-dup");
    expect(document.activeElement).toBe(copyRowFocusBtn);
  });

  it("after Delete of the focused row, DOM focus moves to the surviving sibling row's focus button", () => {
    renderOutline({ initialFocus: "u1" }); // S1_q1 focused; S1_q2 is the next sibling

    const row = screen.getByTestId("question-card-S1_q1");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });

    const survivorFocusBtn = screen.getByTestId("outline-focus-S1_q2");
    expect(document.activeElement).toBe(survivorFocusBtn);
  });

  it("deleting the LAST surviving focused question moves DOM focus to its section's + Add question control", () => {
    const onlyQuestion = [q("only", "S1_only", "S1", 1)];
    renderOutline({
      sections: [{ uid: "s1", stableKey: "S1", name: "Section One" }],
      questions: onlyQuestion,
      initialFocus: "only",
    });

    const row = screen.getByTestId("question-card-S1_only");
    act(() => {
      fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    });

    const addBtn = screen.getByTestId("outline-add-question-S1");
    expect(document.activeElement).toBe(addBtn);
  });
});

describe("EditorOutline — collapse persists across unmount (ED5 Task 3, audit C)", () => {
  /**
   * Reproduces the flag-ON "Edit" tab lifecycle: Radix `TabsContent` is NOT
   * force-mounted, so `EditorOutline` unmounts on tab-away and remounts on
   * tab-back. Collapse used to live in a LOCAL `useState` inside
   * `EditorOutline` and reset on every remount; it now lives in the
   * always-mounted `useEditorSelection` slice the controller owns, so it must
   * survive. This harness calls the REAL hook in a parent that stays mounted
   * across a simulated tab round-trip, toggling whether `EditorOutline`
   * itself is in the tree — exactly the unmount boundary the flag-ON shell
   * imposes.
   */
  function Harness() {
    const selection = useEditorSelection();
    const [mounted, setMounted] = useState(true);
    return (
      <div>
        <button
          type="button"
          data-testid="toggle-mount"
          onClick={() => setMounted((m) => !m)}
        >
          toggle mount
        </button>
        {mounted ? (
          <EditorOutline
            sections={SECTIONS}
            questions={baseQuestions()}
            focusedQuestionUid={selection.focusedQuestionUid}
            setFocusedQuestionUid={selection.setFocusedQuestionUid}
            isReadOnly={false}
            isUnlocked={true}
            conditionalEnabled={true}
            isSectionCollapsed={selection.isSectionCollapsed}
            toggleSectionCollapsed={selection.toggleSectionCollapsed}
            setSectionCollapsed={selection.setSectionCollapsed}
            onAddQuestion={jest.fn(() => "u-new")}
            onDuplicateQuestion={jest.fn(() => "u-copy")}
            onDeleteQuestion={jest.fn((uid: string) => ({
              removedUid: uid,
              affectedDependentUids: [],
            }))}
            onReorderQuestions={jest.fn()}
            onGoToSections={jest.fn()}
          />
        ) : null}
      </div>
    );
  }

  it("collapsing a section, unmounting EditorOutline, and remounting it keeps the section collapsed", () => {
    render(<Harness />);

    // Collapse S1.
    act(() => {
      fireEvent.click(screen.getByTestId("outline-section-toggle-S1"));
    });
    expect(screen.queryByTestId("question-card-S1_q1")).toBeNull();
    expect(screen.getByTestId("outline-section-toggle-S1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Simulate a tab-away: EditorOutline unmounts (the parent — the
    // always-mounted controller in production — stays up).
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-mount"));
    });
    expect(screen.queryByTestId("editor-outline")).toBeNull();

    // Simulate tab-back: EditorOutline remounts.
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-mount"));
    });

    // Collapse survived the unmount — S1 is still collapsed.
    expect(screen.getByTestId("outline-section-toggle-S1")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("question-card-S1_q1")).toBeNull();
  });
});
