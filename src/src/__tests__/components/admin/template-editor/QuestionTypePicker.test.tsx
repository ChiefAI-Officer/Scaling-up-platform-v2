/**
 * QuestionTypePicker — ED9 Task 5 (spec 19al-plan) tests.
 *
 * Proves: shows the current type's friendly label; opening lists exactly the
 * 4 engine types (friendly labels); selecting a DIFFERENT type calls the
 * shared `changeType` (Task 3, useQuestionEditorActions) with the right next
 * enum value; selecting the CURRENT type is a no-op (closes, no call);
 * `question.isInherited` renders the non-interactive `type-locked` chip with
 * no dropdown and never calls `changeType`; `isReadOnly` locks the same way.
 * `changeType` is passed in as a prop (already bound by the parent's OWN
 * `useQuestionEditorActions()` instance) — this component never constructs
 * the hook itself, so there is no double-confirm risk to test here.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QuestionTypePicker } from "@/components/admin/template-editor/QuestionTypePicker";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";

function baseQuestion(
  overrides: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid: "u-1",
    stableKey: "S1_Q1",
    sectionStableKey: "S1",
    label: "How aligned is the team?",
    helpText: "",
    isRequired: true,
    type: "MULTI_CHOICE",
    scaleMin: 0,
    scaleMax: 10,
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
    sortOrder: 0,
    recommendations: [],
    // loosely-typed test fixture (babel-jest strips types); cast for any
    // fields the evolving QuestionDraftRow adds.
    ...overrides,
  } as QuestionDraftRow;
}

describe("QuestionTypePicker", () => {
  it("shows the current type's friendly label on the trigger button", () => {
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "MULTI_CHOICE" })}
        isReadOnly={false}
        isUnlocked={true}
        changeType={jest.fn()}
      />,
    );
    const trigger = screen.getByTestId("question-type-picker");
    expect(trigger).toHaveTextContent("Multiple choice");
  });

  it("opens a menu listing exactly the 4 friendly engine types", () => {
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "MULTI_CHOICE" })}
        isReadOnly={false}
        isUnlocked={true}
        changeType={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("question-type-picker"));
    const menu = screen.getByTestId("question-type-picker-menu");
    expect(within(menu).getByText("Slider")).toBeInTheDocument();
    expect(within(menu).getByText("Multiple choice")).toBeInTheDocument();
    expect(within(menu).getByText("Number")).toBeInTheDocument();
    expect(within(menu).getByText("Short text")).toBeInTheDocument();
    // Exactly 4 — no dormant TEXTAREA/COMPOUND placeholders.
    expect(within(menu).getAllByRole("button")).toHaveLength(4);
  });

  it("selecting a DIFFERENT type calls changeType with the right next enum value", () => {
    const changeType = jest.fn();
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "MULTI_CHOICE" })}
        isReadOnly={false}
        isUnlocked={true}
        changeType={changeType}
      />,
    );
    fireEvent.click(screen.getByTestId("question-type-picker"));
    fireEvent.click(screen.getByTestId("question-type-option-SLIDER_LIKERT"));
    expect(changeType).toHaveBeenCalledTimes(1);
    const [calledQuestion, calledNextType] = changeType.mock.calls[0];
    expect(calledQuestion.uid).toBe("u-1");
    expect(calledNextType).toBe("SLIDER_LIKERT");
    // Menu closes after a selection.
    expect(
      screen.queryByTestId("question-type-picker-menu"),
    ).not.toBeInTheDocument();
  });

  it("selecting the CURRENT type is a no-op (closes, does not call changeType)", () => {
    const changeType = jest.fn();
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "MULTI_CHOICE" })}
        isReadOnly={false}
        isUnlocked={true}
        changeType={changeType}
      />,
    );
    fireEvent.click(screen.getByTestId("question-type-picker"));
    fireEvent.click(screen.getByTestId("question-type-option-MULTI_CHOICE"));
    expect(changeType).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("question-type-picker-menu"),
    ).not.toBeInTheDocument();
  });

  it("renders a locked chip (no dropdown) for an inherited question and never calls changeType", () => {
    const changeType = jest.fn();
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "NUMBER", isInherited: true })}
        isReadOnly={false}
        isUnlocked={true}
        changeType={changeType}
      />,
    );
    const chip = screen.getByTestId("type-locked");
    expect(chip).toHaveTextContent("Number");
    expect(chip).toHaveTextContent(/locked/i);
    expect(screen.queryByTestId("question-type-picker")).not.toBeInTheDocument();

    // Non-interactive: no dropdown to open, and no path to changeType.
    fireEvent.click(chip);
    expect(
      screen.queryByTestId("question-type-picker-menu"),
    ).not.toBeInTheDocument();
    expect(changeType).not.toHaveBeenCalled();
  });

  it("renders the locked chip when isReadOnly is true, even for a new-to-draft question", () => {
    const changeType = jest.fn();
    render(
      <QuestionTypePicker
        question={baseQuestion({ type: "TEXT", isInherited: false })}
        isReadOnly={true}
        isUnlocked={true}
        changeType={changeType}
      />,
    );
    const chip = screen.getByTestId("type-locked");
    expect(chip).toHaveTextContent("Short text");
    expect(screen.queryByTestId("question-type-picker")).not.toBeInTheDocument();
    expect(changeType).not.toHaveBeenCalled();
  });
});
