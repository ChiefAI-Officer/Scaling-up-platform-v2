/**
 * FormQuestionCard — ED9 Task 7 (spec 19al-plan) tests.
 *
 * Collapsed: one compact line (drag handle · position · type pill · prompt
 * focus button · glyph state badges) — NO text Duplicate/Delete links (those
 * move to the focused footer). Focused: title input (`onUpdate({label})`) +
 * `QuestionTypePicker` beside it, help-text input (`onUpdate({helpText})`),
 * the live `QuestionCanvas` preview, `QuestionSettings`, the Wave U
 * `FindingsPanel` / Wave W `ShowIfPanel` (flag-gated), and a footer action bar
 * (Duplicate/Delete icons + a Required switch that reuses the Wave W
 * show-if⇒optional interlock). `isReadOnly` suppresses drag + the footer and
 * disables inputs. Mirrors `QuestionCard`'s `React.memo` + primitive-field
 * `areEqual` render-guard contract (`single-column-render-guard.test.ts`).
 */
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  FormQuestionCard,
  formQuestionCardPropsAreEqual,
  type FormQuestionCardProps,
  type FormQuestionCardSection,
} from "@/components/admin/template-editor/FormQuestionCard";
import type {
  CardViewModel,
  CardBadges,
} from "@/components/admin/template-editor/single-column-view-model";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

afterEach(() => cleanup());

const sections: FormQuestionCardSection[] = [
  { stableKey: "S1", name: "Section One" },
];

function vm(
  overrides: Partial<Omit<CardViewModel, "badges">> & {
    badges?: Partial<CardBadges>;
  } = {},
): CardViewModel {
  const { badges, ...rest } = overrides;
  return {
    uid: "u-1",
    stableKey: "S1_Q1",
    type: "SLIDER_LIKERT",
    label: "How aligned is the team?",
    sectionStableKey: "S1",
    position: 1,
    badges: {
      findings: false,
      showIf: false,
      required: false,
      unassigned: false,
      ...(badges ?? {}),
    },
    ...rest,
  };
}

function baseQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u-1",
    stableKey: "S1_Q1",
    sectionStableKey: "S1",
    label: "How aligned is the team?",
    helpText: "",
    isRequired: false,
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

function baseProps(
  overrides: Partial<FormQuestionCardProps> = {},
): FormQuestionCardProps {
  return {
    vm: vm(),
    question: null,
    isFocused: false,
    isReadOnly: false,
    isUnlocked: true,
    findingsEnabled: false,
    conditionalEnabled: false,
    sections,
    showIfGates: [],
    showIfDependents: [],
    publishedOptionKeys: {},
    onFocus: jest.fn(),
    onDuplicate: jest.fn(),
    onDelete: jest.fn(),
    onMove: jest.fn(),
    onClearDependents: jest.fn(),
    onUpdate: jest.fn(),
    registerFocusRef: jest.fn(),
    ...overrides,
  };
}

describe("FormQuestionCard — collapsed row", () => {
  it("renders the drag handle, position, friendly type pill, and the prompt as a focus button", () => {
    render(<FormQuestionCard {...baseProps()} />);
    expect(screen.getByTestId("form-drag-handle-u-1")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Slider")).toBeInTheDocument();
    expect(
      screen.getByTestId("form-card-focus-u-1"),
    ).toHaveTextContent("How aligned is the team?");
  });

  it("falls back to stableKey then (untitled) when the label is blank", () => {
    const { rerender } = render(
      <FormQuestionCard {...baseProps({ vm: vm({ label: "" }) })} />,
    );
    expect(screen.getByTestId("form-card-focus-u-1")).toHaveTextContent(
      "S1_Q1",
    );
    rerender(
      <FormQuestionCard
        {...baseProps({ vm: vm({ label: "", stableKey: "" }) })}
      />,
    );
    expect(screen.getByTestId("form-card-focus-u-1")).toHaveTextContent(
      "(untitled)",
    );
  });

  it("clicking the focus button calls onFocus with the uid", () => {
    const onFocus = jest.fn();
    render(<FormQuestionCard {...baseProps({ onFocus })} />);
    fireEvent.click(screen.getByTestId("form-card-focus-u-1"));
    expect(onFocus).toHaveBeenCalledWith("u-1");
  });

  it("renders NO text Duplicate/Delete links on the collapsed row", () => {
    render(<FormQuestionCard {...baseProps()} />);
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-card-duplicate-u-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-card-delete-u-1")).not.toBeInTheDocument();
  });

  it("renders a glyph badge with a title tooltip ONLY for true badge flags", () => {
    render(
      <FormQuestionCard
        {...baseProps({
          vm: vm({ badges: { required: true, showIf: false, findings: true, unassigned: false } }),
        })}
      />,
    );
    const required = screen.getByTitle("Required");
    expect(required).toHaveTextContent("＊");
    const findings = screen.getByTitle("Findings");
    expect(findings).toHaveTextContent("✎");
    expect(screen.queryByTitle("Show-if")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Unassigned")).not.toBeInTheDocument();
  });

  it("renders the Show-if and Unassigned glyphs when those flags are true", () => {
    render(
      <FormQuestionCard
        {...baseProps({
          vm: vm({ badges: { required: false, showIf: true, findings: false, unassigned: true } }),
        })}
      />,
    );
    expect(screen.getByTitle("Show-if")).toHaveTextContent("⚑");
    expect(screen.getByTitle("Unassigned")).toHaveTextContent("⚠");
  });

  it("hides the drag handle when isReadOnly", () => {
    render(<FormQuestionCard {...baseProps({ isReadOnly: true })} />);
    expect(screen.queryByTestId("form-drag-handle-u-1")).not.toBeInTheDocument();
  });

  it("does not render the expanded body when not focused", () => {
    render(<FormQuestionCard {...baseProps()} />);
    expect(screen.queryByTestId("form-card-body-u-1")).not.toBeInTheDocument();
  });
});

describe("FormQuestionCard — focused body", () => {
  function focusedProps(
    overrides: Partial<FormQuestionCardProps> = {},
  ): FormQuestionCardProps {
    return baseProps({
      isFocused: true,
      question: baseQuestion(),
      ...overrides,
    });
  }

  it("renders the expanded body slot when focused", () => {
    render(<FormQuestionCard {...focusedProps()} />);
    expect(screen.getByTestId("form-card-body-u-1")).toBeInTheDocument();
  });

  it("renders a title input bound to the label that calls onUpdate({label})", () => {
    const onUpdate = jest.fn();
    render(<FormQuestionCard {...focusedProps({ onUpdate })} />);
    const title = screen.getByTestId("form-card-title-u-1") as HTMLInputElement;
    expect(title.value).toBe("How aligned is the team?");
    fireEvent.change(title, { target: { value: "New title" } });
    expect(onUpdate).toHaveBeenCalledWith({ label: "New title" });
  });

  it("renders QuestionTypePicker beside the title", () => {
    render(<FormQuestionCard {...focusedProps()} />);
    expect(screen.getByTestId("question-type-picker")).toBeInTheDocument();
  });

  it("renders the locked type chip when the question is inherited", () => {
    render(
      <FormQuestionCard
        {...focusedProps({ question: baseQuestion({ isInherited: true }) })}
      />,
    );
    expect(screen.getByTestId("type-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("question-type-picker")).not.toBeInTheDocument();
  });

  it("renders a help-text input that calls onUpdate({helpText})", () => {
    const onUpdate = jest.fn();
    render(
      <FormQuestionCard
        {...focusedProps({ onUpdate, question: baseQuestion({ helpText: "Consider Q3." }) })}
      />,
    );
    const help = screen.getByTestId("form-card-help-u-1") as HTMLInputElement;
    expect(help.value).toBe("Consider Q3.");
    fireEvent.change(help, { target: { value: "New help" } });
    expect(onUpdate).toHaveBeenCalledWith({ helpText: "New help" });
  });

  it("renders the live QuestionCanvas preview", () => {
    render(<FormQuestionCard {...focusedProps()} />);
    expect(screen.getByTestId("question-canvas")).toBeInTheDocument();
  });

  it("renders QuestionSettings (the per-type config body)", () => {
    render(<FormQuestionCard {...focusedProps()} />);
    expect(screen.getByText("Slider settings")).toBeInTheDocument();
  });

  it("renders the footer action bar with Duplicate + Delete icon buttons", () => {
    const onDuplicate = jest.fn();
    const onDelete = jest.fn();
    render(<FormQuestionCard {...focusedProps({ onDuplicate, onDelete })} />);
    fireEvent.click(screen.getByTestId("form-card-duplicate-u-1"));
    expect(onDuplicate).toHaveBeenCalledWith("u-1");
    fireEvent.click(screen.getByTestId("form-card-delete-u-1"));
    expect(onDelete).toHaveBeenCalledWith("u-1");
  });

  it("renders a Required switch reflecting isRequired that calls onUpdate({isRequired})", () => {
    const onUpdate = jest.fn();
    render(
      <FormQuestionCard
        {...focusedProps({ onUpdate, question: baseQuestion({ isRequired: false }) })}
      />,
    );
    const sw = screen.getByTestId("form-card-required-u-1");
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onUpdate).toHaveBeenCalledWith({ isRequired: true });
  });

  it("disables the Required switch with a hint when the question carries a show-if rule", () => {
    const onUpdate = jest.fn();
    render(
      <FormQuestionCard
        {...focusedProps({
          onUpdate,
          conditionalEnabled: true,
          question: baseQuestion({
            isRequired: false,
            showIf: { questionKey: "S1_GATE", optionKey: "opt_a" },
          }),
        })}
      />,
    );
    const sw = screen.getByTestId("form-card-required-u-1");
    expect(sw).toBeDisabled();
    expect(screen.getByTestId("form-card-required-hint-u-1")).toBeInTheDocument();
    fireEvent.click(sw);
    expect(onUpdate).not.toHaveBeenCalledWith({ isRequired: true });
  });

  it("does NOT disable Required for a showIf rule when conditionalEnabled is false", () => {
    render(
      <FormQuestionCard
        {...focusedProps({
          conditionalEnabled: false,
          question: baseQuestion({
            showIf: { questionKey: "S1_GATE", optionKey: "opt_a" },
          }),
        })}
      />,
    );
    expect(screen.getByTestId("form-card-required-u-1")).not.toBeDisabled();
  });

  it("renders FindingsPanel only when findingsEnabled is true (and type !== TEXT)", () => {
    const { rerender } = render(
      <FormQuestionCard {...focusedProps({ findingsEnabled: false })} />,
    );
    expect(screen.queryByTestId("q-findings-panel")).not.toBeInTheDocument();
    rerender(<FormQuestionCard {...focusedProps({ findingsEnabled: true })} />);
    expect(screen.getByTestId("q-findings-panel")).toBeInTheDocument();
  });

  it("omits FindingsPanel for TEXT questions even when findingsEnabled", () => {
    render(
      <FormQuestionCard
        {...focusedProps({
          findingsEnabled: true,
          question: baseQuestion({ type: "TEXT" }),
        })}
      />,
    );
    expect(screen.queryByTestId("q-findings-panel")).not.toBeInTheDocument();
  });

  it("renders ShowIfPanel only when conditionalEnabled is true", () => {
    const { rerender } = render(
      <FormQuestionCard {...focusedProps({ conditionalEnabled: false })} />,
    );
    expect(screen.queryByTestId("q-showif-panel")).not.toBeInTheDocument();
    rerender(
      <FormQuestionCard {...focusedProps({ conditionalEnabled: true })} />,
    );
    expect(screen.getByTestId("q-showif-panel")).toBeInTheDocument();
  });
});

describe("FormQuestionCard — isReadOnly", () => {
  function readOnlyFocusedProps(
    overrides: Partial<FormQuestionCardProps> = {},
  ): FormQuestionCardProps {
    return baseProps({
      isFocused: true,
      isReadOnly: true,
      question: baseQuestion(),
      ...overrides,
    });
  }

  it("hides the drag handle", () => {
    render(<FormQuestionCard {...readOnlyFocusedProps()} />);
    expect(screen.queryByTestId("form-drag-handle-u-1")).not.toBeInTheDocument();
  });

  it("renders no footer action bar (no Duplicate/Delete/Required)", () => {
    render(<FormQuestionCard {...readOnlyFocusedProps()} />);
    expect(screen.queryByTestId("form-card-footer-u-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-card-duplicate-u-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-card-delete-u-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-card-required-u-1")).not.toBeInTheDocument();
  });

  it("disables the title and help-text inputs", () => {
    render(<FormQuestionCard {...readOnlyFocusedProps()} />);
    expect(screen.getByTestId("form-card-title-u-1")).toBeDisabled();
    expect(screen.getByTestId("form-card-help-u-1")).toBeDisabled();
  });

  it("renders the type picker's locked chip, not the interactive dropdown", () => {
    render(<FormQuestionCard {...readOnlyFocusedProps()} />);
    expect(screen.getByTestId("type-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("question-type-picker")).not.toBeInTheDocument();
  });
});

describe("FormQuestionCard — move to section", () => {
  it("calls onMove with the uid and the newly selected section key", () => {
    const onMove = jest.fn();
    const twoSections: FormQuestionCardSection[] = [
      { stableKey: "S1", name: "Section One" },
      { stableKey: "S2", name: "Section Two" },
    ];
    render(
      <FormQuestionCard {...baseProps({ onMove, sections: twoSections })} />,
    );
    fireEvent.change(screen.getByTestId("form-card-move-u-1"), {
      target: { value: "S2" },
    });
    expect(onMove).toHaveBeenCalledWith("u-1", "S2");
  });

  it("hides the move select when there's only one section", () => {
    render(<FormQuestionCard {...baseProps()} />);
    expect(screen.queryByTestId("form-card-move-u-1")).not.toBeInTheDocument();
  });
});

describe("formQuestionCardPropsAreEqual — render guard (mirrors QuestionCard T9)", () => {
  it("SKIPS re-render when a fresh vm object has identical values", () => {
    expect(
      formQuestionCardPropsAreEqual(
        baseProps(),
        baseProps({ vm: vm(), onFocus: () => {}, onDuplicate: () => {} }),
      ),
    ).toBe(true);
  });

  it("re-renders when the label changes", () => {
    expect(
      formQuestionCardPropsAreEqual(
        baseProps(),
        baseProps({ vm: vm({ label: "New" }) }),
      ),
    ).toBe(false);
  });

  it("NEVER skips a focused card", () => {
    expect(
      formQuestionCardPropsAreEqual(
        baseProps({ isFocused: true }),
        baseProps({ isFocused: true }),
      ),
    ).toBe(false);
  });

  it("re-renders when a state badge changes", () => {
    expect(
      formQuestionCardPropsAreEqual(
        baseProps(),
        baseProps({ vm: vm({ badges: { findings: true } }) }),
      ),
    ).toBe(false);
  });

  it("re-renders when position or section changes", () => {
    expect(
      formQuestionCardPropsAreEqual(baseProps(), baseProps({ vm: vm({ position: 2 }) })),
    ).toBe(false);
    expect(
      formQuestionCardPropsAreEqual(
        baseProps(),
        baseProps({ vm: vm({ sectionStableKey: "S2" }) }),
      ),
    ).toBe(false);
  });

  it("re-renders when the section list changes", () => {
    expect(
      formQuestionCardPropsAreEqual(
        baseProps(),
        baseProps({
          sections: [{ stableKey: "S1", name: "Renamed" }],
        }),
      ),
    ).toBe(false);
  });

  it("re-renders when isReadOnly changes", () => {
    expect(
      formQuestionCardPropsAreEqual(baseProps(), baseProps({ isReadOnly: true })),
    ).toBe(false);
  });
});
