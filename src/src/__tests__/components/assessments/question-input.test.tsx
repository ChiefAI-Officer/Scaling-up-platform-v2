/**
 * Phase C — QuestionInput component (TDD red phase first).
 *
 * Tests:
 *  1. Renders SLIDER_LIKERT as a native range slider (named by label) with
 *     aria-valuemin/max + anchor labels
 *  2. Renders TEXT with textarea
 *  3. Renders NUMBER with number input
 *  4. Renders MULTI_CHOICE with checkboxes
 *  5. MULTI_CHOICE enforces maxChoices — unchecked options disabled once limit reached
 *  6. MULTI_CHOICE onChange fires with correct string[] value
 *  7. TEXT onChange fires with string value
 *  8. NUMBER onChange fires with number value
 *  9. SLIDER_LIKERT dragging fires onChange with the changed value
 * 10. SLIDER_LIKERT clicking at the default minimum (0) commits 0 — fires
 *     onChange(key, 0) even though no "change" event fired
 *     [regression lock for the unselectable-minimum / drag-dance bug]
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
  test("1. renders SLIDER_LIKERT as a native range slider with aria-valuemin/max + anchors", () => {
    render(
      <QuestionInput
        question={sliderQuestion}
        value={3}
        onChange={jest.fn()}
      />
    );
    // The control is a native range slider (role="slider").
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "5");
    // The current value (3) is reflected.
    expect((slider as HTMLInputElement).value).toBe("3");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
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

  test("9. SLIDER_LIKERT dragging fires onChange with the changed value", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={zeroBasedSliderQuestion}
        value={undefined}
        onChange={onChange}
      />
    );
    const slider = screen.getByRole("slider");
    // Drag = a native `change` event carrying the new value.
    fireEvent.change(slider, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("S1_Q0", 2);
  });

  test("10. SLIDER_LIKERT clicking at the default minimum (0) commits 0 — no drag-dance", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={zeroBasedSliderQuestion}
        value={undefined}
        onChange={onChange}
      />
    );
    // Regression lock for the unselectable-minimum bug: the thumb defaults to
    // min (0) and a plain click does NOT fire `change`. The component must
    // commit the slider's CURRENT DOM value on click, so a click at the default
    // minimum records 0 (instead of the user being forced to drag away + back).
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("0"); // thumb sits at min when unanswered
    fireEvent.click(slider);
    expect(onChange).toHaveBeenCalledWith("S1_Q0", 0);
  });

  test("11. SLIDER_LIKERT unanswered renders ticks for each value + prompt; answered shows 'Your rating: N'", () => {
    const tickQuestion: QuestionForInput = {
      stableKey: "tick_q",
      type: "SLIDER_LIKERT",
      label: "Tick test",
      isRequired: true,
      scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
    };

    // --- Unanswered ---
    const { unmount } = render(
      <QuestionInput question={tickQuestion} value={undefined} onChange={jest.fn()} />
    );
    // All tick values should be visible (0,1,2,3)
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // Unanswered status prompt
    expect(screen.getByText("Tap or drag the slider to rate.")).toBeInTheDocument();
    // "—" must NOT be present
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    unmount();

    // --- Answered with value=2 ---
    render(
      <QuestionInput question={tickQuestion} value={2} onChange={jest.fn()} />
    );
    expect(screen.getByText("Your rating: 2")).toBeInTheDocument();
    // Ticks still visible
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("12. SLIDER_LIKERT minimum of a 1-based scale commits on pointer release", () => {
    // Regression for the reported bug: a user who wants to answer the MINIMUM
    // (e.g. 1 on a 1–5 scale) sees the thumb already resting at 1, but a tap
    // that the browser treats as a tiny drag fires neither `change` (value
    // unchanged) nor `click` (movement cancels it) — so 1 never committed and
    // they couldn't proceed. The component must commit on `pointerup` too.
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={sliderQuestion}
        value={undefined}
        onChange={onChange}
      />
    );
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("1"); // thumb sits at min (1) when unanswered
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenCalledWith("S1_Q1", 1);
  });
});

const multiChoiceQuestion: QuestionForInput = {
  stableKey: "S1_MC",
  type: "MULTI_CHOICE",
  label: "Pick some",
  isRequired: true,
  options: [ { key: "a", label: "Alpha" }, { key: "b", label: "Beta" } ],
};

describe("QuestionInput invalid + a11y contract (Wave C)", () => {
  it("slider: invalid sets aria-invalid on the range input", () => {
    render(<QuestionInput question={sliderQuestion} value={undefined} onChange={jest.fn()} invalid />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-invalid", "true");
  });
  it("text: invalid sets aria-invalid + shows a placeholder", () => {
    render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T1" }} value={undefined} onChange={jest.fn()} invalid />);
    const ta = screen.getByRole("textbox");
    expect(ta).toHaveAttribute("aria-invalid", "true");
    expect(ta).toHaveAttribute("placeholder");
  });
  it("multi-choice: invalid sets aria-invalid on the first checkbox (not the role=group wrapper) AND it carries the focus id", () => {
    render(<QuestionInput question={multiChoiceQuestion} value={[]} onChange={jest.fn()} invalid />);
    // aria-invalid lives on the focusable first checkbox, not the role="group"
    // div (jsx-a11y/role-supports-aria-props — the group does not support it).
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("group")).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("id", "q-S1_MC");
  });
  it("text: enforces the 10k maxLength", () => {
    render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T2" }} value={""} onChange={jest.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", "10000");
  });
  it("text: shows the char counter only near the cap", () => {
    const near = "x".repeat(9_500);
    const { rerender } = render(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T3" }} value={"hi"} onChange={jest.fn()} />);
    expect(screen.queryByTestId("char-counter")).toBeNull();
    rerender(<QuestionInput question={{ ...sliderQuestion, type: "TEXT", stableKey: "T3" }} value={near} onChange={jest.fn()} />);
    expect(screen.getByTestId("char-counter")).toHaveTextContent("9500 / 10000");
  });
});
