/**
 * Task 3 — PrintReportButton (TDD).
 *
 * Tests:
 *  1. Renders a button labelled "Print / Download PDF"
 *  2. Clicking the button calls window.print once
 *  3. The button carries the `no-print` class (hides itself on print)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";

describe("PrintReportButton", () => {
  let printMock: jest.SpyInstance;

  beforeEach(() => {
    printMock = jest.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    printMock.mockRestore();
  });

  it("renders a button with the correct label", () => {
    render(<PrintReportButton />);
    expect(
      screen.getByRole("button", { name: /print \/ download pdf/i })
    ).toBeInTheDocument();
  });

  it("calls window.print once when clicked", () => {
    render(<PrintReportButton />);
    fireEvent.click(screen.getByRole("button", { name: /print \/ download pdf/i }));
    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it("has the no-print class so it is hidden on print", () => {
    render(<PrintReportButton />);
    const btn = screen.getByRole("button", { name: /print \/ download pdf/i });
    expect(btn).toHaveClass("no-print");
  });
});
