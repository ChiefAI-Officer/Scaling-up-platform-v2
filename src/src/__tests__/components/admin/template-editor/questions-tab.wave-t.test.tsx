/**
 * Wave T (spec 19t §T-2, D3/D4/D9) — QuestionsTab type unlock.
 *
 * Flag OFF (isUnlocked=false): today's slider-only editor renders
 * byte-identically — disabled v1.5 optgroups, the v1.5 accordions +
 * deferred panel, the non-slider fallback card.
 *
 * Flag ON (isUnlocked=true): four plain enabled type options
 * (SLIDER_LIKERT / TEXT / NUMBER / MULTI_CHOICE), inherited locks
 * (type select disabled + helper), MULTI_CHOICE options editor,
 * impact confirms (inherited delete / inherited-option remove /
 * inherited slider scale change), "(assigned on save)" placeholder.
 */

import React from "react";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  within,
} from "@testing-library/react";

import {
  QuestionsTab,
  hydrateQuestionsFromJson,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

// ────────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────
const sections: SectionDraft[] = [
  { uid: "sec1", stableKey: "S1_strategy", name: "Strategy" },
];

function makeQuestion(overrides: Partial<QuestionDraft>): QuestionDraft {
  return {
    uid: "q1",
    stableKey: "S1_q1",
    sectionStableKey: "S1_strategy",
    label: "How aligned is the team?",
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
    ...overrides,
  };
}

interface RenderOpts {
  isUnlocked: boolean;
  questions: QuestionDraft[];
  publishedOptionKeys?: Record<string, readonly string[]>;
  isReadOnly?: boolean;
}

function renderTab(opts: RenderOpts) {
  const onAddQuestion = jest.fn();
  const onUpdateQuestion = jest.fn();
  const onDeleteQuestion = jest.fn();
  const onDuplicateQuestion = jest.fn();
  const onReorderQuestions = jest.fn();
  const utils = render(
    <QuestionsTab
      sections={sections}
      questions={opts.questions}
      onAddQuestion={onAddQuestion}
      onUpdateQuestion={onUpdateQuestion}
      onDeleteQuestion={onDeleteQuestion}
      onDuplicateQuestion={onDuplicateQuestion}
      onReorderQuestions={onReorderQuestions}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked={opts.isUnlocked}
      publishedOptionKeys={opts.publishedOptionKeys ?? {}}
    />,
  );
  return {
    ...utils,
    onAddQuestion,
    onUpdateQuestion,
    onDeleteQuestion,
    onDuplicateQuestion,
    onReorderQuestions,
  };
}

function getTypeSelect(): HTMLSelectElement {
  const form = screen.getByTestId("questions-config-form");
  return within(form).getByLabelText("Question Type") as HTMLSelectElement;
}

// ────────────────────────────────────────────────────────────────────────
// Flag OFF — byte-identical legacy UI
// ────────────────────────────────────────────────────────────────────────
describe("QuestionsTab — Wave T flag OFF (isUnlocked=false)", () => {
  it("type dropdown keeps SLIDER enabled + all v1.5 placeholders present-and-disabled", () => {
    renderTab({ isUnlocked: false, questions: [makeQuestion({})] });

    const select = getTypeSelect();
    const options = Array.from(select.querySelectorAll("option"));
    const byValue = (v: string) => options.find((o) => o.value === v);

    expect(byValue("SLIDER_LIKERT")).toBeTruthy();
    expect(byValue("SLIDER_LIKERT")!.disabled).toBe(false);
    for (const v of ["TEXT", "NUMBER", "MULTI_CHOICE", "TEXTAREA", "COMPOUND"]) {
      expect(byValue(v)).toBeTruthy();
      expect(byValue(v)!.disabled).toBe(true);
    }
    // Legacy optgroup structure intact.
    expect(select.querySelectorAll("optgroup").length).toBe(2);
  });

  it("renders the v1.5 deferred panel + NUMBER/MULTI_CHOICE accordions", () => {
    renderTab({ isUnlocked: false, questions: [makeQuestion({})] });

    expect(screen.getByTestId("v15-deferred-panel")).toBeInTheDocument();
    const form = screen.getByTestId("questions-config-form");
    expect(within(form).getByTestId("number-accordion")).toBeInTheDocument();
    expect(within(form).getByTestId("multichoice-accordion")).toBeInTheDocument();
  });

  it("shows the non-slider fallback card for a TEXT question", () => {
    renderTab({
      isUnlocked: false,
      questions: [makeQuestion({ type: "TEXT" })],
    });

    expect(
      screen.getByText(/editing not available for this question type in v1/i),
    ).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────
// Flag ON — unlocked editor
// ────────────────────────────────────────────────────────────────────────
describe("QuestionsTab — Wave T flag ON (isUnlocked=true)", () => {
  it("type dropdown has exactly 4 enabled options on a new-to-draft question (no optgroups, no TEXTAREA/COMPOUND)", () => {
    renderTab({ isUnlocked: true, questions: [makeQuestion({})] });

    const select = getTypeSelect();
    expect(select).not.toBeDisabled();
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((o) => o.value)).toEqual([
      "SLIDER_LIKERT",
      "TEXT",
      "NUMBER",
      "MULTI_CHOICE",
    ]);
    options.forEach((o) => expect(o.disabled).toBe(false));
    expect(select.querySelectorAll("optgroup").length).toBe(0);
  });

  it("type select is disabled with the lock helper on an inherited question", () => {
    renderTab({
      isUnlocked: true,
      questions: [makeQuestion({ isInherited: true, isNewToDraft: false })],
    });

    expect(getTypeSelect()).toBeDisabled();
    expect(
      screen.getByText(
        /Type is locked once published — a different type is a new question \(delete \+ add\)\./,
      ),
    ).toBeInTheDocument();
  });

  it("hides the v1.5 deferred panel, accordions, and non-slider fallback card", () => {
    renderTab({
      isUnlocked: true,
      questions: [makeQuestion({ type: "TEXT" })],
    });

    expect(screen.queryByTestId("v15-deferred-panel")).toBeNull();
    expect(screen.queryByTestId("number-accordion")).toBeNull();
    expect(screen.queryByTestId("multichoice-accordion")).toBeNull();
    expect(
      screen.queryByText(/editing not available for this question type in v1/i),
    ).toBeNull();
  });

  it("shows the TEXT helper note (multi-line answer box + 10,000-char cap)", () => {
    renderTab({
      isUnlocked: true,
      questions: [makeQuestion({ type: "TEXT" })],
    });
    expect(screen.getByText(/multi-line answer box/i)).toBeInTheDocument();
    expect(screen.getByText(/10,000/)).toBeInTheDocument();
  });

  it("shows the NUMBER helper note (finite-number validation, units in help text)", () => {
    renderTab({
      isUnlocked: true,
      questions: [makeQuestion({ type: "NUMBER" })],
    });
    const note = screen.getByTestId("number-config-note");
    expect(note.textContent).toMatch(/finite/i);
    expect(note.textContent).toMatch(/Help text/i);
  });

  describe("MULTI_CHOICE options editor", () => {
    const mcQuestion = () =>
      makeQuestion({
        type: "MULTI_CHOICE",
        stableKey: "S1_choices",
        isInherited: true,
        isNewToDraft: false,
        options: [
          { key: "alpha", label: "Alpha", isNew: false },
          { key: "", label: "", isNew: true },
        ],
        maxChoices: null,
      });

    it("renders one row per option with key badge, label input, remove button + add button + maxChoices", () => {
      renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      expect(screen.getByTestId("q-option-label-0")).toHaveValue("Alpha");
      expect(screen.getByTestId("q-option-label-1")).toHaveValue("");
      expect(screen.getByTestId("q-option-remove-0")).toBeInTheDocument();
      expect(screen.getByTestId("q-option-remove-1")).toBeInTheDocument();
      expect(screen.getByTestId("q-option-add")).toBeInTheDocument();
      expect(screen.getByTestId("q-maxchoices")).toBeInTheDocument();
      // Persisted key badge + "auto from label" for the new empty-key option.
      expect(screen.getByText("alpha")).toBeInTheDocument();
      expect(screen.getByText(/auto from label/i)).toBeInTheDocument();
    });

    it("+ Add option patches options with a new { key:'', label:'', isNew:true } row", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      act(() => {
        fireEvent.click(screen.getByTestId("q-option-add"));
      });

      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
        options: [
          { key: "alpha", label: "Alpha", isNew: false },
          { key: "", label: "", isNew: true },
          { key: "", label: "", isNew: true },
        ],
      });
    });

    it("editing an option label patches only that option", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      act(() => {
        fireEvent.change(screen.getByTestId("q-option-label-1"), {
          target: { value: "Beta" },
        });
      });

      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
        options: [
          { key: "alpha", label: "Alpha", isNew: false },
          { key: "", label: "Beta", isNew: true },
        ],
      });
    });

    it("maxChoices input patches a number, blank patches null", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [{ ...mcQuestion(), maxChoices: 2 }],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      // Controlled input starts at 2 (question.maxChoices).
      expect(screen.getByTestId("q-maxchoices")).toHaveValue(2);

      act(() => {
        fireEvent.change(screen.getByTestId("q-maxchoices"), {
          target: { value: "" },
        });
      });
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { maxChoices: null });

      act(() => {
        fireEvent.change(screen.getByTestId("q-maxchoices"), {
          target: { value: "1" },
        });
      });
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { maxChoices: 1 });
    });

    it("removing an option whose key is published fires window.confirm; cancel → no update", () => {
      (window.confirm as jest.Mock).mockImplementation(() => false);
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      act(() => {
        fireEvent.click(screen.getByTestId("q-option-remove-0"));
      });

      expect(window.confirm).toHaveBeenCalledTimes(1);
      const msg = String((window.confirm as jest.Mock).mock.calls[0][0]);
      expect(msg).toContain("alpha");
      expect(msg).toMatch(/S5_why_/);
      expect(msg).toMatch(/vote-share/i);
      expect(onUpdateQuestion).not.toHaveBeenCalled();
    });

    it("removing a published-key option with OK applies the removal", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      act(() => {
        fireEvent.click(screen.getByTestId("q-option-remove-0"));
      });

      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
        options: [{ key: "", label: "", isNew: true }],
      });
    });

    it("removing a NEW (non-published) option does NOT confirm", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [mcQuestion()],
        publishedOptionKeys: { S1_choices: ["alpha"] },
      });

      act(() => {
        fireEvent.click(screen.getByTestId("q-option-remove-1"));
      });

      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
        options: [{ key: "alpha", label: "Alpha", isNew: false }],
      });
    });

    it("shows the at-least-one-option hint when options are empty", () => {
      renderTab({
        isUnlocked: true,
        questions: [
          makeQuestion({ type: "MULTI_CHOICE", options: [], maxChoices: null }),
        ],
      });

      expect(
        screen.getByText(/At least one option is required to save/i),
      ).toBeInTheDocument();
    });
  });

  describe("delete confirms (D4)", () => {
    it("inherited delete confirm names the stableKey + consequence classes (crosswalk etc.)", () => {
      const { onDeleteQuestion } = renderTab({
        isUnlocked: true,
        questions: [
          makeQuestion({
            stableKey: "S1_q1",
            isInherited: true,
            isNewToDraft: false,
          }),
        ],
      });

      const list = screen.getByTestId("questions-question-list");
      act(() => {
        fireEvent.click(
          within(list).getByRole("button", { name: /^Delete$/ }),
        );
      });

      expect(window.confirm).toHaveBeenCalledTimes(1);
      const msg = String((window.confirm as jest.Mock).mock.calls[0][0]);
      expect(msg).toContain("S1_q1");
      expect(msg).toMatch(/trend/i);
      expect(msg).toMatch(/crosswalk/i);
      expect(msg).toMatch(/benchmark/i);
      expect(onDeleteQuestion).toHaveBeenCalledWith("q1");
    });

    it("new-to-draft delete keeps the simple confirm text", () => {
      const { onDeleteQuestion } = renderTab({
        isUnlocked: true,
        questions: [makeQuestion({ stableKey: "S1_q1" })],
      });

      const list = screen.getByTestId("questions-question-list");
      act(() => {
        fireEvent.click(
          within(list).getByRole("button", { name: /^Delete$/ }),
        );
      });

      expect(window.confirm).toHaveBeenCalledWith("Delete question S1_q1?");
      expect(onDeleteQuestion).toHaveBeenCalledWith("q1");
    });
  });

  describe("inherited slider scale-change confirm (D9)", () => {
    it("confirms once per question per session; cancel discards the change", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [
          makeQuestion({ isInherited: true, isNewToDraft: false }),
        ],
      });

      const form = screen.getByTestId("questions-config-form");
      const scaleMin = within(form).getByLabelText("Scale min");

      // First change — cancel: discarded, nothing applied.
      (window.confirm as jest.Mock).mockImplementationOnce(() => false);
      act(() => {
        fireEvent.change(scaleMin, { target: { value: "1" } });
      });
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(
        String((window.confirm as jest.Mock).mock.calls[0][0]),
      ).toMatch(/measurement/i);
      expect(onUpdateQuestion).not.toHaveBeenCalled();

      // Second change — OK: applied, acknowledged for this question.
      act(() => {
        fireEvent.change(scaleMin, { target: { value: "2" } });
      });
      expect(window.confirm).toHaveBeenCalledTimes(2);
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { scaleMin: 2 });

      // Third change — no further confirm for the same question.
      act(() => {
        fireEvent.change(scaleMin, { target: { value: "3" } });
      });
      expect(window.confirm).toHaveBeenCalledTimes(2);
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { scaleMin: 3 });
    });

    it("does not confirm scale changes on a new-to-draft slider", () => {
      const { onUpdateQuestion } = renderTab({
        isUnlocked: true,
        questions: [makeQuestion({})],
      });

      const form = screen.getByTestId("questions-config-form");
      act(() => {
        fireEvent.change(within(form).getByLabelText("Scale max"), {
          target: { value: "10" },
        });
      });
      expect(window.confirm).not.toHaveBeenCalled();
      expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { scaleMax: 10 });
    });
  });

  it("shows '(assigned on save)' for a stableKey-less new question (form + list badge)", () => {
    renderTab({
      isUnlocked: true,
      questions: [makeQuestion({ stableKey: "" })],
    });

    const matches = screen.getAllByText(/\(assigned on save\)/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const form = screen.getByTestId("questions-config-form");
    expect(within(form).getByLabelText("stableKey")).toHaveValue(
      "(assigned on save)",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// hydrateQuestionsFromJson — Wave T fields
// ────────────────────────────────────────────────────────────────────────
describe("hydrateQuestionsFromJson — Wave T", () => {
  const raw = [
    {
      stableKey: "S1_pick",
      sectionStableKey: "S1_strategy",
      label: "Pick some",
      type: "MULTI_CHOICE",
      isRequired: true,
      sortOrder: 1,
      options: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
        "garbage",
      ],
      maxChoices: 2,
    },
    {
      stableKey: "S1_new",
      sectionStableKey: "S1_strategy",
      label: "Newer",
      type: "TEXT",
      isRequired: false,
      sortOrder: 2,
    },
  ];

  it("reads options (isNew:false) + maxChoices; sets isInherited from publishedKeys", () => {
    const drafts = hydrateQuestionsFromJson(raw, new Set(["S1_pick"]));
    expect(drafts[0].options).toEqual([
      { key: "a", label: "A", isNew: false },
      { key: "b", label: "B", isNew: false },
    ]);
    expect(drafts[0].maxChoices).toBe(2);
    expect(drafts[0].isInherited).toBe(true);
    expect(drafts[0].isNewToDraft).toBe(false);

    expect(drafts[1].options).toEqual([]);
    expect(drafts[1].maxChoices).toBeNull();
    expect(drafts[1].isInherited).toBe(false);
    expect(drafts[1].isNewToDraft).toBe(true);
  });

  it("defaults to an empty published set (existing callers unbroken)", () => {
    const drafts = hydrateQuestionsFromJson(raw);
    expect(drafts.every((d) => !d.isInherited)).toBe(true);
    expect(drafts.every((d) => d.isNewToDraft)).toBe(true);
  });
});
