import { render, screen } from "@testing-library/react";

jest.mock("@vercel/blob/client", () => ({ upload: jest.fn() }));

import { FileManager } from "@/components/files/file-manager";

const workshops = [
  {
    id: "workshop-1",
    workshopCode: "W-320",
    title: "A deliberately long workshop title that must not widen mobile filters",
  },
];

function filterSelects() {
  const filterRow = screen.getByText("Filter:").parentElement;
  if (!filterRow) throw new Error("Filter row not found");
  return Array.from(filterRow.querySelectorAll("select"));
}

describe("FileManager responsive filters", () => {
  it("keeps the legacy filter classes unchanged by default", () => {
    render(<FileManager initialFiles={[]} workshops={workshops} />);

    for (const select of filterSelects()) {
      expect(select).toHaveAttribute(
        "class",
        "rounded-md border-border text-sm shadow-sm focus:border-primary focus:ring-primary",
      );
    }
  });

  it("contains both responsive filters below sm and restores auto width at sm", () => {
    render(<FileManager initialFiles={[]} workshops={workshops} responsiveEnabled />);

    for (const select of filterSelects()) {
      expect(select).toHaveClass(
        "min-h-11",
        "min-w-0",
        "w-full",
        "max-w-full",
        "sm:w-auto",
        "sm:max-w-none",
      );
    }
  });
});
