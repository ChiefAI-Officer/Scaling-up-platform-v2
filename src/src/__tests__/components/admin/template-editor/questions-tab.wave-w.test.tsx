/**
 * Wave W (spec 19w §2.6) — the QuestionsTab "Show only when…" panel.
 *
 * Flag OFF (conditionalEnabled absent/false): no showIf DOM exists.
 * Flag ON: collapsible panel on the focused question; gate dropdown lists
 * only PRECEDING MULTI_CHOICE questions (canonical order — C1); option
 * dropdown lists the chosen gate's options; Clear removes the rule; the
 * required toggle and the panel interlock both ways (C6); deleting a
 * referenced gate / removing a referenced option / retyping a referenced
 * gate warns and clears dependents (confirm-drop); hydration round-trips
 * persisted showIf; inherited questions stay editable (reword-class).
 */

import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import {
  hydrateQuestionsFromJson,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";
// ED3 Task 3 — selection lifted out of QuestionsTab; harness supplies it.
import { QuestionsTabHarness } from "./questions-tab-harness";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

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
afterEach(() => {
  cleanup();
});

const sections: SectionDraft[] = [
  { uid: "sec1", stableKey: "S1_main", name: "Main" },
];

let uidCounter = 0;
function makeQuestion(overrides: Partial<QuestionDraft>): QuestionDraft {
  uidCounter += 1;
  return {
    uid: `q${uidCounter}`,
    stableKey: `S1_q${uidCounter}`,
    sectionStableKey: "S1_main",
    label: `Question ${uidCounter}`,
    helpText: "",
    isRequired: false,
    type: "TEXT",
    sortOrder: uidCounter,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: false,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...overrides,
  };
}

function gateQuestion(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return makeQuestion({
    stableKey: "S1_gate",
    type: "MULTI_CHOICE",
    sortOrder: 1,
    options: [
      { key: "sales", label: "Sales", isNew: false },
      { key: "cash", label: "Cash", isNew: false },
    ],
    ...overrides,
  });
}

function renderTab(opts: {
  questions: QuestionDraft[];
  conditionalEnabled?: boolean;
  isReadOnly?: boolean;
}) {
  const onUpdateQuestion = jest.fn();
  const onDeleteQuestion = jest.fn();
  const utils = render(
    <QuestionsTabHarness
      sections={sections}
      questions={opts.questions}
      onAddQuestion={jest.fn()}
      onUpdateQuestion={onUpdateQuestion}
      onDeleteQuestion={onDeleteQuestion}
      onDuplicateQuestion={jest.fn()}
      onReorderQuestions={jest.fn()}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked={true}
      publishedOptionKeys={{}}
      {...(opts.conditionalEnabled !== undefined
        ? { conditionalEnabled: opts.conditionalEnabled }
        : {})}
    />,
  );
  return { ...utils, onUpdateQuestion, onDeleteQuestion };
}

/** Focus the question with the given stableKey (click its Edit button). */
function focusQuestion(stableKey: string) {
  const row = screen.getByText(stableKey).closest("li")!;
  fireEvent.click(
    Array.from(row.querySelectorAll("button")).find(
      (b) => b.textContent === "Edit",
    )!,
  );
}

// ── Flag OFF ────────────────────────────────────────────────────────────

describe("flag OFF", () => {
  it("renders no showIf DOM at all", () => {
    renderTab({ questions: [gateQuestion(), makeQuestion({ sortOrder: 2 })] });
    expect(screen.queryByTestId("q-showif-panel")).toBeNull();
    expect(screen.queryByTestId("q-showif-toggle")).toBeNull();
  });
});

// ── Flag ON — panel basics ──────────────────────────────────────────────

describe("flag ON — panel", () => {
  it("shows the panel on a question with a preceding MULTI_CHOICE gate", () => {
    const dep = makeQuestion({ stableKey: "S1_dep", sortOrder: 2 });
    renderTab({ questions: [gateQuestion(), dep], conditionalEnabled: true });
    focusQuestion("S1_dep");
    expect(screen.getByTestId("q-showif-toggle")).toBeInTheDocument();
  });

  it("gate dropdown lists ONLY preceding MULTI_CHOICE questions (not self, not later, not TEXT)", () => {
    const gate = gateQuestion();
    const textQ = makeQuestion({ stableKey: "S1_text", sortOrder: 2 });
    const dep = makeQuestion({ stableKey: "S1_dep", sortOrder: 3 });
    const laterMc = makeQuestion({
      stableKey: "S1_later_mc",
      type: "MULTI_CHOICE",
      sortOrder: 4,
      options: [{ key: "x", label: "X", isNew: false }],
    });
    renderTab({
      questions: [gate, textQ, dep, laterMc],
      conditionalEnabled: true,
    });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    const select = screen.getByTestId("q-showif-gate") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("S1_gate");
    expect(values).not.toContain("S1_text");
    expect(values).not.toContain("S1_dep");
    expect(values).not.toContain("S1_later_mc");
  });

  it("excludes unsaved gates (blank stableKey) — they can't be referenced yet", () => {
    const unsavedGate = gateQuestion({ stableKey: "", isNewToDraft: true });
    const dep = makeQuestion({ stableKey: "S1_dep", sortOrder: 2 });
    renderTab({ questions: [unsavedGate, dep], conditionalEnabled: true });
    focusQuestion("S1_dep");
    // No eligible gate and no existing rule → hint instead of controls.
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    expect(screen.queryByTestId("q-showif-gate")).toBeNull();
    expect(screen.getByTestId("q-showif-no-gates")).toBeInTheDocument();
  });

  it("choosing a gate then an option patches showIf; Clear nulls it", () => {
    const dep = makeQuestion({ stableKey: "S1_dep", sortOrder: 2 });
    const { onUpdateQuestion } = renderTab({
      questions: [gateQuestion(), dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    fireEvent.change(screen.getByTestId("q-showif-gate"), {
      target: { value: "S1_gate" },
    });
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, {
      showIf: { questionKey: "S1_gate", optionKey: "" },
    });
  });

  it("selecting the option completes the rule", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "" },
    });
    const { onUpdateQuestion } = renderTab({
      questions: [gateQuestion(), dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    fireEvent.change(screen.getByTestId("q-showif-option"), {
      target: { value: "sales" },
    });
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, {
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
  });

  it("Clear rule nulls showIf", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    const { onUpdateQuestion } = renderTab({
      questions: [gateQuestion(), dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    fireEvent.click(screen.getByTestId("q-showif-clear"));
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, { showIf: null });
  });

  it("stays editable on INHERITED questions (reword-class)", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      isInherited: true,
      isNewToDraft: false,
    });
    renderTab({
      questions: [gateQuestion({ isInherited: true }), dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    expect(
      (screen.getByTestId("q-showif-gate") as HTMLSelectElement).disabled,
    ).toBe(false);
  });

  it("read-only disables the controls", () => {
    // Read-only mode disables the Edit buttons, so the DEFAULT focused
    // question (lowest sortOrder) must be the one carrying the rule.
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 0,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    renderTab({
      questions: [gateQuestion(), dep],
      conditionalEnabled: true,
      isReadOnly: true,
    });
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    expect(
      (screen.getByTestId("q-showif-gate") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("q-showif-clear") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("warns on a DANGLING rule (gate no longer eligible) and still offers Clear", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gone", optionKey: "sales" },
    });
    renderTab({ questions: [gateQuestion(), dep], conditionalEnabled: true });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    expect(screen.getByTestId("q-showif-dangling")).toBeInTheDocument();
    expect(screen.getByTestId("q-showif-clear")).toBeInTheDocument();
  });
});

// ── Required interlock (C6) ─────────────────────────────────────────────

describe("required interlock", () => {
  it("a required question gets the explanatory note and no rule controls", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      isRequired: true,
    });
    renderTab({ questions: [gateQuestion(), dep], conditionalEnabled: true });
    focusQuestion("S1_dep");
    fireEvent.click(screen.getByTestId("q-showif-toggle"));
    expect(screen.getByTestId("q-showif-required-note")).toBeInTheDocument();
    expect(screen.queryByTestId("q-showif-gate")).toBeNull();
  });

  it("a question with showIf has its Required toggle disabled", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    renderTab({ questions: [gateQuestion(), dep], conditionalEnabled: true });
    focusQuestion("S1_dep");
    expect(
      (screen.getByLabelText("Required") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("flag OFF leaves the Required toggle alone even when showIf is stored", () => {
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    renderTab({ questions: [gateQuestion(), dep] });
    focusQuestion("S1_dep");
    expect(
      (screen.getByLabelText("Required") as HTMLInputElement).disabled,
    ).toBe(false);
  });
});

// ── Dependent hygiene (confirm-drop) ────────────────────────────────────

describe("dependent hygiene", () => {
  it("deleting a referenced gate warns (naming the dependent) and clears dependents after confirm", () => {
    const gate = gateQuestion();
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    const { onUpdateQuestion, onDeleteQuestion } = renderTab({
      questions: [gate, dep],
      conditionalEnabled: true,
    });
    const row = screen.getByText("S1_gate").closest("li")!;
    fireEvent.click(
      Array.from(row.querySelectorAll("button")).find(
        (b) => b.textContent === "Delete",
      )!,
    );
    expect((window.confirm as jest.Mock).mock.calls[0][0]).toContain("S1_dep");
    expect(onDeleteQuestion).toHaveBeenCalledWith(gate.uid);
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, { showIf: null });
  });

  it("cancelling the gate delete leaves dependents untouched", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const gate = gateQuestion();
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    const { onUpdateQuestion, onDeleteQuestion } = renderTab({
      questions: [gate, dep],
      conditionalEnabled: true,
    });
    const row = screen.getByText("S1_gate").closest("li")!;
    fireEvent.click(
      Array.from(row.querySelectorAll("button")).find(
        (b) => b.textContent === "Delete",
      )!,
    );
    expect(onDeleteQuestion).not.toHaveBeenCalled();
    expect(onUpdateQuestion).not.toHaveBeenCalled();
  });

  it("removing a REFERENCED option warns (naming the dependent) and clears it after confirm", () => {
    const gate = gateQuestion();
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    const { onUpdateQuestion } = renderTab({
      questions: [gate, dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_gate");
    // Remove the "sales" option (index 0 in the options editor).
    fireEvent.click(screen.getByTestId("q-option-remove-0"));
    const confirmText = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(confirmText).toContain("S1_dep");
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, { showIf: null });
  });

  it("retyping a referenced gate away from MULTI_CHOICE warns and clears dependents", () => {
    const gate = gateQuestion({ isNewToDraft: true, isInherited: false });
    const dep = makeQuestion({
      stableKey: "S1_dep",
      sortOrder: 2,
      showIf: { questionKey: "S1_gate", optionKey: "sales" },
    });
    const { onUpdateQuestion } = renderTab({
      questions: [gate, dep],
      conditionalEnabled: true,
    });
    focusQuestion("S1_gate");
    fireEvent.change(screen.getByLabelText("Question Type"), {
      target: { value: "TEXT" },
    });
    const confirmText = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(confirmText).toContain("S1_dep");
    expect(onUpdateQuestion).toHaveBeenCalledWith(dep.uid, { showIf: null });
  });
});

// ── Hydration ───────────────────────────────────────────────────────────

describe("hydrateQuestionsFromJson — showIf", () => {
  it("round-trips a persisted showIf", () => {
    const drafts = hydrateQuestionsFromJson(
      [
        {
          stableKey: "S1_dep",
          sortOrder: 1,
          type: "TEXT",
          label: "Dep",
          sectionStableKey: "S1_main",
          isRequired: false,
          showIf: { questionKey: "S1_gate", optionKey: "sales" },
        },
      ],
      new Set(),
    );
    expect(drafts[0].showIf).toEqual({
      questionKey: "S1_gate",
      optionKey: "sales",
    });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["non-object", "S1_gate:sales"],
    ["missing optionKey", { questionKey: "S1_gate" }],
    ["non-string keys", { questionKey: 5, optionKey: "sales" }],
  ])("hydrates %s showIf to null", (_name, showIf) => {
    const drafts = hydrateQuestionsFromJson(
      [
        {
          stableKey: "S1_dep",
          sortOrder: 1,
          type: "TEXT",
          label: "Dep",
          sectionStableKey: "S1_main",
          isRequired: false,
          ...(showIf === undefined ? {} : { showIf }),
        },
      ],
      new Set(),
    );
    expect(drafts[0].showIf).toBeNull();
  });
});
