import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TierBandBar } from "@/components/admin/template-editor/TierBandBar";

const tiers = [
  { minMetric: 0, maxMetric: 2, label: "Low", message: "" },
  { minMetric: 3, maxMetric: 5, label: "High", message: "" },
];
const domain = { min: 0, max: 5, isInteger: true };

describe("TierBandBar (ED5 T17, B-5)", () => {
  it("renders one divider per interior boundary for a finite domain", () => {
    render(
      <TierBandBar
        tiers={tiers}
        domain={domain}
        mode="integer"
        onChange={() => {}}
        isReadOnly={false}
        testIdPrefix="tb"
      />,
    );
    expect(screen.getByTestId("tb-divider-0")).toBeInTheDocument();
    expect(screen.queryByTestId("tb-divider-1")).toBeNull();
  });

  it("ArrowRight moves the boundary +1 via the canonical integer conversion", () => {
    const onChange = jest.fn();
    render(
      <TierBandBar
        tiers={tiers}
        domain={domain}
        mode="integer"
        onChange={onChange}
        isReadOnly={false}
        testIdPrefix="tb"
      />,
    );
    fireEvent.keyDown(screen.getByTestId("tb-divider-0"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith([
      { minMetric: 0, maxMetric: 3, label: "Low", message: "" },
      { minMetric: 4, maxMetric: 5, label: "High", message: "" },
    ]);
  });

  it("clamps at the upper neighbour so the top tier keeps ≥1 (End key)", () => {
    const onChange = jest.fn();
    render(
      <TierBandBar
        tiers={tiers}
        domain={domain}
        mode="integer"
        onChange={onChange}
        isReadOnly={false}
        testIdPrefix="tb"
      />,
    );
    fireEvent.keyDown(screen.getByTestId("tb-divider-0"), { key: "End" });
    expect(onChange).toHaveBeenCalledWith([
      { minMetric: 0, maxMetric: 4, label: "Low", message: "" },
      { minMetric: 5, maxMetric: 5, label: "High", message: "" },
    ]);
  });

  it("returns null when domain.max is non-finite (open-ended)", () => {
    const { container } = render(
      <TierBandBar
        tiers={tiers}
        domain={{ min: 0, max: Infinity, isInteger: true }}
        mode="integer"
        onChange={() => {}}
        isReadOnly={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("read-only disables the dividers", () => {
    render(
      <TierBandBar
        tiers={tiers}
        domain={domain}
        mode="integer"
        onChange={() => {}}
        isReadOnly
        testIdPrefix="tb"
      />,
    );
    expect(screen.getByTestId("tb-divider-0")).toBeDisabled();
  });

  it("exposes ARIA slider semantics on each divider", () => {
    render(
      <TierBandBar
        tiers={tiers}
        domain={domain}
        mode="integer"
        onChange={() => {}}
        isReadOnly={false}
        testIdPrefix="tb"
      />,
    );
    const d = screen.getByTestId("tb-divider-0");
    expect(d).toHaveAttribute("role", "slider");
    expect(d).toHaveAttribute("aria-valuenow", "2");
  });
});
