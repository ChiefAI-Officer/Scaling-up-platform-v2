import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhaseTile } from "@/components/assessments/phase-tile";
import { GROWTH_PHASE_NARRATIVES } from "@/lib/assessments/su-full-phase";

describe("PhaseTile", () => {
  it("renders the phase heading + verbatim narrative for a given GrowthPhase", () => {
    const phase = GROWTH_PHASE_NARRATIVES[1];
    render(<PhaseTile phase={phase} onContinue={jest.fn()} />);
    expect(
      screen.getByRole("heading", { name: phase.heading }),
    ).toBeInTheDocument();
    // A verbatim fragment of the P1 narrative is present.
    expect(
      screen.getByText(/actively involved co-worker/i),
    ).toBeInTheDocument();
  });

  it("fires onContinue when the Continue button is clicked", () => {
    const onContinue = jest.fn();
    render(
      <PhaseTile phase={GROWTH_PHASE_NARRATIVES[3]} onContinue={onContinue} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders under the su-assessment-brand scope (zero global leak)", () => {
    const { container } = render(
      <PhaseTile phase={GROWTH_PHASE_NARRATIVES[5]} onContinue={jest.fn()} />,
    );
    expect(container.querySelector(".su-assessment-brand")).toBeInTheDocument();
  });
});
