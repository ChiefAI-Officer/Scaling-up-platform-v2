/**
 * Wave U (spec 19u U-4/D8/D21) — the QuestionsTab Findings panel.
 *
 * Flag OFF (findingsEnabled absent/false): no findings DOM exists — the tab
 * renders byte-identically to pre-Wave-U.
 *
 * Flag ON: collapsible panel per SLIDER/NUMBER/MULTI_CHOICE question (never
 * TEXT), band rows + advisory slider coverage hint, per-option texts,
 * editable on INHERITED questions (D9 reword-class), read-only respected,
 * retype confirm drops rules (D21), option removal cleans the rule up,
 * hydration round-trips persisted rules.
 */

import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

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

function renderTab(opts: {
  questions: QuestionDraft[];
  findingsEnabled?: boolean;
  isReadOnly?: boolean;
}) {
  const onUpdateQuestion = jest.fn();
  const utils = render(
    <QuestionsTabHarness
      sections={sections}
      questions={opts.questions}
      onAddQuestion={jest.fn()}
      onUpdateQuestion={onUpdateQuestion}
      onDeleteQuestion={jest.fn()}
      onDuplicateQuestion={jest.fn()}
      onReorderQuestions={jest.fn()}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked={true}
      publishedOptionKeys={{}}
      {...(opts.findingsEnabled !== undefined
        ? { findingsEnabled: opts.findingsEnabled }
        : {})}
    />,
  );
  return { ...utils, onUpdateQuestion };
}

function openPanel() {
  fireEvent.click(screen.getByTestId("q-findings-toggle"));
}

// ── Flag OFF ────────────────────────────────────────────────────────────

describe("flag OFF — byte-identical", () => {
  it("no findings DOM exists, and the markup equals an explicit findingsEnabled={false} render", () => {
    const q = makeQuestion({
      findingBands: [{ minScore: 0, maxScore: 10, text: "hydrated band" }],
    });
    // dnd-kit mints incrementing a11y ids per render — normalize them so
    // the comparison sees only real DOM differences.
    const normalize = (html: string) =>
      html.replace(/Dnd(DescribedBy|LiveRegion|Monitor)[-\w]*\d+/g, "DND_ID");
    const a = renderTab({ questions: [q] }); // prop absent
    expect(screen.queryByTestId("q-findings-panel")).toBeNull();
    const htmlAbsent = normalize(a.container.innerHTML);
    cleanup();
    const b = renderTab({ questions: [q], findingsEnabled: false });
    expect(normalize(b.container.innerHTML)).toBe(htmlAbsent);
  });
});

// ── Flag ON — panel per type ────────────────────────────────────────────

describe("flag ON — panel rendering", () => {
  it("SLIDER gets a band panel with a rule-count badge; TEXT gets none", () => {
    renderTab({
      questions: [
        makeQuestion({
          findingBands: [
            { minScore: 0, maxScore: 4, text: "Low" },
            { minScore: 5, maxScore: 10, text: "High" },
          ],
        }),
      ],
      findingsEnabled: true,
    });
    const panel = screen.getByTestId("q-findings-panel");
    expect(panel.textContent).toContain("Findings (2)");
    cleanup();
    renderTab({
      questions: [makeQuestion({ type: "TEXT" })],
      findingsEnabled: true,
    });
    expect(screen.queryByTestId("q-findings-panel")).toBeNull();
  });

  it("band rows render open with add/remove and update via onUpdateQuestion", () => {
    const { onUpdateQuestion } = renderTab({
      questions: [
        makeQuestion({
          type: "NUMBER",
          findingBands: [{ minScore: 0, maxScore: 9, text: "Tiny" }],
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    expect(screen.getByTestId("q-finding-band-min-0")).toHaveProperty("value", "0");
    fireEvent.change(screen.getByTestId("q-finding-band-text-0"), {
      target: { value: "Tiny team!" },
    });
    expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
      findingBands: [{ minScore: 0, maxScore: 9, text: "Tiny team!" }],
    });
    fireEvent.click(screen.getByTestId("q-finding-band-add"));
    expect(onUpdateQuestion).toHaveBeenLastCalledWith("q1", {
      findingBands: [
        { minScore: 0, maxScore: 9, text: "Tiny" },
        { minScore: null, maxScore: null, text: "" },
      ],
    });
    fireEvent.click(screen.getByTestId("q-finding-band-remove-0"));
    expect(onUpdateQuestion).toHaveBeenLastCalledWith("q1", {
      findingBands: [],
    });
  });

  it("slider coverage hint names the missing range; complete tiling shows no hint; NUMBER shows no coverage hint", () => {
    renderTab({
      questions: [
        makeQuestion({
          findingBands: [{ minScore: 0, maxScore: 6, text: "partial" }],
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    expect(screen.getByTestId("q-finding-coverage").textContent).toContain(
      "missing 7–10",
    );
    cleanup();
    renderTab({
      questions: [
        makeQuestion({
          findingBands: [
            { minScore: 0, maxScore: 4, text: "a" },
            { minScore: 5, maxScore: 10, text: "b" },
          ],
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    expect(screen.queryByTestId("q-finding-coverage")).toBeNull();
    cleanup();
    renderTab({
      questions: [
        makeQuestion({
          type: "NUMBER",
          findingBands: [{ minScore: 0, maxScore: 6, text: "gappy" }],
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    expect(screen.queryByTestId("q-finding-coverage")).toBeNull();
  });

  it("MULTI_CHOICE renders one text per keyed option; key-less options say save-first", () => {
    const { onUpdateQuestion } = renderTab({
      questions: [
        makeQuestion({
          type: "MULTI_CHOICE",
          options: [
            { key: "cash", label: "Cash", isNew: false },
            { key: "", label: "Brand new", isNew: true },
          ],
          findingOptionTexts: { cash: "Cash finding" },
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    const cashBox = screen.getByTestId("q-finding-option-cash");
    expect(cashBox).toHaveProperty("value", "Cash finding");
    fireEvent.change(cashBox, { target: { value: "Updated" } });
    expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
      findingOptionTexts: { cash: "Updated" },
    });
    const panel = screen.getByTestId("q-findings-panel");
    expect(panel.textContent).toContain("Save the draft first");
  });

  it("is EDITABLE on inherited questions (D9) and disabled in read-only mode", () => {
    renderTab({
      questions: [
        makeQuestion({
          isInherited: true,
          isNewToDraft: false,
          findingBands: [{ minScore: 0, maxScore: 10, text: "b" }],
        }),
      ],
      findingsEnabled: true,
    });
    openPanel();
    expect(
      (screen.getByTestId("q-finding-band-text-0") as HTMLTextAreaElement).disabled,
    ).toBe(false);
    cleanup();
    renderTab({
      questions: [
        makeQuestion({
          findingBands: [{ minScore: 0, maxScore: 10, text: "b" }],
        }),
      ],
      findingsEnabled: true,
      isReadOnly: true,
    });
    openPanel();
    expect(
      (screen.getByTestId("q-finding-band-text-0") as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });
});

// ── D21 interactions ────────────────────────────────────────────────────

describe("retype + option removal (D21)", () => {
  function typeSelect(): HTMLSelectElement {
    const form = screen.getByTestId("questions-config-form");
    return within(form).getByLabelText("Question Type") as HTMLSelectElement;
  }

  it("ANY retype with rules confirms and drops them (even SLIDER→NUMBER)", () => {
    const { onUpdateQuestion } = renderTab({
      questions: [
        makeQuestion({
          findingBands: [{ minScore: 0, maxScore: 10, text: "band" }],
        }),
      ],
      findingsEnabled: true,
    });
    fireEvent.change(typeSelect(), { target: { value: "NUMBER" } });
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("1 finding rule"),
    );
    expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
      type: "NUMBER",
      findingBands: [],
      findingOptionTexts: {},
    });
  });

  it("cancelling the retype confirm aborts the type change entirely", () => {
    (window.confirm as jest.Mock).mockImplementation(() => false);
    const { onUpdateQuestion } = renderTab({
      questions: [
        makeQuestion({
          findingBands: [{ minScore: 0, maxScore: 10, text: "band" }],
        }),
      ],
      findingsEnabled: true,
    });
    fireEvent.change(typeSelect(), { target: { value: "TEXT" } });
    expect(onUpdateQuestion).not.toHaveBeenCalled();
  });

  it("retype without rules needs no confirm", () => {
    const { onUpdateQuestion } = renderTab({
      questions: [makeQuestion({})],
      findingsEnabled: true,
    });
    fireEvent.change(typeSelect(), { target: { value: "TEXT" } });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onUpdateQuestion).toHaveBeenCalledWith("q1", { type: "TEXT" });
  });

  it("removing a new-to-draft option silently drops its rule text", () => {
    const { onUpdateQuestion } = renderTab({
      questions: [
        makeQuestion({
          type: "MULTI_CHOICE",
          options: [
            { key: "cash", label: "Cash", isNew: true },
            { key: "people", label: "People", isNew: true },
          ],
          findingOptionTexts: { cash: "Cash finding", people: "P" },
        }),
      ],
      findingsEnabled: true,
    });
    fireEvent.click(screen.getByTestId("q-option-remove-0"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onUpdateQuestion).toHaveBeenCalledWith("q1", {
      options: [{ key: "people", label: "People", isNew: true }],
      findingOptionTexts: { people: "P" },
    });
  });
});

// ── Hydration ───────────────────────────────────────────────────────────

describe("hydrateQuestionsFromJson — findings round-trip", () => {
  it("bands hydrate on SLIDER/NUMBER; option rules hydrate on MULTI_CHOICE; TEXT rules are dropped", () => {
    const drafts = hydrateQuestionsFromJson([
      {
        stableKey: "S1_s",
        type: "SLIDER_LIKERT",
        label: "S",
        sortOrder: 1,
        isRequired: true,
        scale: { min: 0, max: 10, step: 1, anchorMin: "a", anchorMax: "b" },
        recommendations: [{ minScore: 0, maxScore: 10, text: "band" }],
      },
      {
        stableKey: "S1_m",
        type: "MULTI_CHOICE",
        label: "M",
        sortOrder: 2,
        isRequired: false,
        options: [{ key: "cash", label: "Cash" }],
        recommendations: [{ optionKey: "cash", text: "rule" }],
      },
      {
        stableKey: "S1_t",
        type: "TEXT",
        label: "T",
        sortOrder: 3,
        isRequired: false,
        recommendations: [{ minScore: 0, maxScore: 9, text: "stray" }],
      },
    ]);
    expect(drafts[0].findingBands).toEqual([
      { minScore: 0, maxScore: 10, text: "band" },
    ]);
    expect(drafts[0].findingOptionTexts).toEqual({});
    expect(drafts[1].findingOptionTexts).toEqual({ cash: "rule" });
    expect(drafts[1].findingBands).toEqual([]);
    expect(drafts[2].findingBands).toEqual([]);
    expect(drafts[2].findingOptionTexts).toEqual({});
  });
});
