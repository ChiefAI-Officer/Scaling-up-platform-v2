/**
 * Wave R — R-1 participant slider UX (Jeff #8): tap-a-number-to-set.
 *
 * TDD (red first). Spec: docs/specs/v7.6/19r-wave-r-slider-printing-design.md § R-1.
 *
 * Tests:
 *  1. Tick numbers render as <button type="button"> — tapping one calls
 *     onChange(stableKey, value) through the same path as drag
 *  2. Tap answers a previously UNANSWERED question (first answer)
 *  3. Buttons carry tabIndex={-1} (Tab skips them; range input stays the
 *     single keyboard control) + aria-label "Set rating to N"
 *  4. The ticks row is NO LONGER aria-hidden (interactive children must not
 *     be hidden from assistive tech)
 *  5. disabled propagates to the buttons — click fires nothing
 *  6. Empty-state status copy = "Tap a number or drag the slider to rate.";
 *     answered copy "Your rating: N" unchanged
 *  7. Tapping the currently-selected number re-commits the same value
 *     (harmless no-op contract — matches drag-to-same)
 *  8. Class hooks preserved: buttons keep survey-slider-tick + is-current
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
  scale: { min: 0, max: 10, step: 1, anchorMin: "Not true", anchorMax: "Always true" },
};

describe("QuestionInput SLIDER_LIKERT tap-a-number (Wave R R-1)", () => {
  test("1. tapping a number button calls onChange with (stableKey, value)", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput question={sliderQuestion} value={4} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Set rating to 7" }));
    expect(onChange).toHaveBeenCalledWith("S1_Q1", 7);
  });

  test("2. tapping a number answers a previously unanswered question", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={sliderQuestion}
        value={undefined}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Set rating to 3" }));
    expect(onChange).toHaveBeenCalledWith("S1_Q1", 3);
  });

  test("3. buttons have type=button, tabIndex=-1, and aria-label 'Set rating to N'", () => {
    render(
      <QuestionInput question={sliderQuestion} value={4} onChange={jest.fn()} />
    );
    // One button per scale value (0..10)
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(11);
    buttons.forEach((btn, i) => {
      expect(btn).toHaveAttribute("type", "button");
      expect(btn).toHaveAttribute("tabindex", "-1");
      expect(btn).toHaveAttribute("aria-label", `Set rating to ${i}`);
      expect(btn).toHaveTextContent(String(i));
    });
  });

  test("4. the ticks row no longer has aria-hidden", () => {
    const { container } = render(
      <QuestionInput question={sliderQuestion} value={4} onChange={jest.fn()} />
    );
    const ticksRow = container.querySelector(".survey-slider-ticks");
    expect(ticksRow).not.toBeNull();
    expect(ticksRow).not.toHaveAttribute("aria-hidden");
  });

  test("5. disabled propagates to the buttons — click fires nothing", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput
        question={sliderQuestion}
        value={4}
        onChange={onChange}
        disabled
      />
    );
    const btn = screen.getByRole("button", { name: "Set rating to 7" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("6. empty-state status copy is updated; answered copy unchanged", () => {
    const { unmount } = render(
      <QuestionInput
        question={sliderQuestion}
        value={undefined}
        onChange={jest.fn()}
      />
    );
    expect(
      screen.getByText("Tap a number or drag the slider to rate.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tap or drag the slider to rate.")
    ).not.toBeInTheDocument();
    unmount();

    render(
      <QuestionInput question={sliderQuestion} value={6} onChange={jest.fn()} />
    );
    expect(screen.getByText("Your rating: 6")).toBeInTheDocument();
  });

  test("7. tapping the currently-selected number re-commits the same value", () => {
    const onChange = jest.fn();
    render(
      <QuestionInput question={sliderQuestion} value={5} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Set rating to 5" }));
    expect(onChange).toHaveBeenCalledWith("S1_Q1", 5);
  });

  test("8. class hooks preserved — buttons keep survey-slider-tick + is-current", () => {
    render(
      <QuestionInput question={sliderQuestion} value={5} onChange={jest.fn()} />
    );
    const current = screen.getByRole("button", { name: "Set rating to 5" });
    expect(current).toHaveClass("survey-slider-tick", "is-current");
    const other = screen.getByRole("button", { name: "Set rating to 4" });
    expect(other).toHaveClass("survey-slider-tick");
    expect(other).not.toHaveClass("is-current");
  });
});
