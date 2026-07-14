/**
 * ED5 Task 8 (audit B-1b) — LogicMapDrawer unit tests.
 *
 * A read-only drawer that renders every authored show-if relationship in
 * plain language: "'<dependent>' shows only when '<gate>' = '<option>'".
 * No editing controls — the per-question "Show only when…" panel
 * (QuestionInspector) is the only write surface for showIf.
 */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { LogicMapDrawer } from "@/components/admin/template-editor/LogicMapDrawer";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

function q(overrides: Partial<QuestionDraftRow> = {}): QuestionDraftRow {
  return {
    uid: "u",
    stableKey: "",
    sectionStableKey: "S1",
    label: "",
    helpText: "",
    isRequired: false,
    type: "TEXT",
    sortOrder: 1,
    scaleMin: 0,
    scaleMax: 0,
    scaleStep: 1,
    anchorMin: "",
    anchorMax: "",
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

const sections: SectionDraft[] = [
  { uid: "s1", stableKey: "S1", name: "Section One" },
  { uid: "s2", stableKey: "S2", name: "Section Two" },
];

describe("LogicMapDrawer", () => {
  it("renders a plain-language line for a show-if relationship", () => {
    const questions: QuestionDraftRow[] = [
      q({
        uid: "ug",
        stableKey: "S1_do",
        sectionStableKey: "S1",
        label: "Do you have a plan?",
        type: "MULTI_CHOICE",
        options: [
          { key: "yes", label: "Yes", isNew: false },
          { key: "no", label: "No", isNew: false },
        ],
      }),
      q({
        uid: "ud",
        stableKey: "S2_plan",
        sectionStableKey: "S2",
        label: "Detailed plan",
        showIf: { questionKey: "S1_do", optionKey: "yes" },
      }),
    ];
    render(
      <LogicMapDrawer
        open={true}
        onClose={jest.fn()}
        sections={sections}
        questions={questions}
      />,
    );
    expect(
      screen.getByText(/Detailed plan.*shows only when.*Yes/i),
    ).toBeInTheDocument();
  });

  it("falls back to stableKeys/option key when labels are blank", () => {
    const questions: QuestionDraftRow[] = [
      q({
        uid: "ug",
        stableKey: "S1_do",
        sectionStableKey: "S1",
        label: "",
        type: "MULTI_CHOICE",
        options: [{ key: "yes", label: "", isNew: false }],
      }),
      q({
        uid: "ud",
        stableKey: "S2_plan",
        sectionStableKey: "S2",
        label: "",
        showIf: { questionKey: "S1_do", optionKey: "yes" },
      }),
    ];
    render(
      <LogicMapDrawer
        open={true}
        onClose={jest.fn()}
        sections={sections}
        questions={questions}
      />,
    );
    expect(
      screen.getByText(/S2_plan.*shows only when.*S1_do.*yes/i),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no question has showIf", () => {
    const questions: QuestionDraftRow[] = [
      q({ uid: "u1", stableKey: "S1_q1", label: "Q1" }),
    ];
    render(
      <LogicMapDrawer
        open={true}
        onClose={jest.fn()}
        sections={sections}
        questions={questions}
      />,
    );
    expect(
      screen.getByText("No conditional logic in this template."),
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <LogicMapDrawer
        open={false}
        onClose={jest.fn()}
        sections={sections}
        questions={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is read-only — no button other than Close", () => {
    const questions: QuestionDraftRow[] = [
      q({
        uid: "ug",
        stableKey: "S1_do",
        sectionStableKey: "S1",
        label: "Do you have a plan?",
        type: "MULTI_CHOICE",
        options: [{ key: "yes", label: "Yes", isNew: false }],
      }),
      q({
        uid: "ud",
        stableKey: "S2_plan",
        sectionStableKey: "S2",
        label: "Detailed plan",
        showIf: { questionKey: "S1_do", optionKey: "yes" },
      }),
    ];
    render(
      <LogicMapDrawer
        open={true}
        onClose={jest.fn()}
        sections={sections}
        questions={questions}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(/close/i);
  });
});
