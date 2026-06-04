/**
 * Phase C — QuestionInput component (TDD red phase first).
 *
 * Tests:
 *  1. Renders SLIDER_LIKERT as a discrete radiogroup (named by label) with one
 *     radio per scale value + anchor labels
 *  2. Renders TEXT with textarea
 *  3. Renders NUMBER with number input
 *  4. Renders MULTI_CHOICE with checkboxes
 *  5. MULTI_CHOICE enforces maxChoices — unchecked options disabled once limit reached
 *  6. MULTI_CHOICE onChange fires with correct string[] value
 *  7. TEXT onChange fires with string value
 *  8. NUMBER onChange fires with number value
 *  9. SLIDER_LIKERT min value (0) is selectable — clicking it fires onChange(key, 0)
 *     [regression lock for the unselectable-minimum bug]
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestionInput } from "@/components/assessments/question-input";
import type { QuestionForInput } from "@/components/assessments/question-input";

const sliderQuestion: QuestionForInput = {
  stableKey: "S1_Q1",
  type: "SLIDER_LIKERT",
  label: "How true is this?",
  isRequired: true,
  scale: { min: 1, max: 5, step: 1, anchorMin: "Never", anchorMax: "Always" },
};

const zeroBasedSliderQuestion: QuestionForInput = {
  stableKey: "S1_Q0",
  type: "SLIDER_LIKERT",
  label: "Zero-based question",
  isRequired: true,
  scale: { min: 0, max: 10, step: 1, anchorMin: "Not true", anchorMax: "Always true" },
};

const textQuestion: QuestionForInput = {
  stableKey: "S1_Q2",
  type: "TEXT",
  label: "Text question",
  isRequired: false,
};

const numberQuestion: QuestionForInput = {
  stableKey: "S1_Q3",
  type: "NUMBER",
  label: "Number question",
  isRequired: false,
};

const multiQuestion: QuestionForInput = {
  stableKey: "S1_Q4",
  type: "MULTI_CHOICE",
  label: "Multi question",
  isRequired: false,
  options: [
    { key: "opt_a", label: "Option A" },
    { key: "opt_b", label: "Option B" },
    { key: "opt_c", label: "Option C" },
  ],
  maxChoices: 2,
};

describe("QuestionInput", () => {
  test("1. renders SLIDER_LIKERT as a discrete radiogroup with one radio per value + anchors", () => {
    render(
      <QuestionInput
        question={sliderQuestion}
        value={3}
        onChange={jest.fn()}
      />
    );
    // The control is a radiogroup named by the question label.
    const group = screen.getByRole("radiogroup", { name: "How true is this?" });
    expect(group).toBeInTheDocument();
    // One radio per scale value (1..5 step 1 = 5 radios).
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    // The radio matching the current value (3) is checked.
    const selected = radios.find((r) => (r as HTMLInputElement).checked);
    expect(selected).toBeChecked();
    expect(selected).toHaveAttribute("value", "3");
    // Anchor labels render.
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Always")).toBeInTheDocument();
  });

  test("2. renders TEXT with textarea", () => {
    render(
      <QuestionInput
        question={textQuestion}
        value="hello"
        onChange={jest.fn()}
      />
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("hello");
  });

  test("3. renders NUMBER with number input", () => {
    render(
      <QuestionInput
        question={numberQuestion}
        value={42}
        onChange={jest.fn()}
      />
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(42);
  });

  test("4. renders MULTI_CHOICE with checkboxes", () => {
    render(
      <QuestionInput
        question={multiQuestion}
        value={[]}
        onChange={jest.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
    expect(screen.getByText("Option C")).toBeInTheDocument();
  });

  test("5. MULTI_CHOICE enforces maxChoices — unchecked options disabled once limit reached", () => {
    render(
      <QuestionInput
        question={multiQuestion}
        value={["opt_a", "opt_b"]} // 2 selected = maxChoices reached
        onChange={jest.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    const [checkA, checkB, checkC] = checkboxes;
    // Already-checked boxes stay enabled (so they can be unchecked)
    expect(checkA).not.toBeDisabled();
    expect(checkB).not.toBeDisabled();
    // Unselected option at limit should be disabled
    expect(checkC).toBeDisabled();
  });

  test("6. MULTI_CHOICE onChange fires with correct string[] value", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={multiQuestion}
        value={["opt_a"]}
        onChange={onChange}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // Click opt_b to add it
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith("S1_Q4", ["opt_a", "opt_b"]);
  });

  test("7. TEXT onChange fires with string value", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={textQuestion}
        value=""
        onChange={onChange}
      />
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "new text" } });
    expect(onChange).toHaveBeenCalledWith("S1_Q2", "new text");
  });

  test("8. NUMBER onChange fires with number value", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={numberQuestion}
        value=""
        onChange={onChange}
      />
    );
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith("S1_Q3", 7);
  });

  test("9. SLIDER_LIKERT minimum value (0) is selectable — clicking it fires onChange(key, 0)", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={zeroBasedSliderQuestion}
        value={undefined}
        onChange={onChange}
      />
    );
    // Regression lock: the minimum (0) was unreachable on the old range slider
    // because the thumb defaulted to min and "changing" to min fired nothing.
    // Anchor regex to the start so it doesn't also match "10 — Always true".
    const zeroRadio = screen.getByRole("radio", { name: /^0 —/ });
    fireEvent.click(zeroRadio);
    expect(onChange).toHaveBeenCalledWith("S1_Q0", 0);
  });
});
