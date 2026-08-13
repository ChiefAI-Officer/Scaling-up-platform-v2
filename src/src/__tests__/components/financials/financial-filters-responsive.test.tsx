import { render, screen } from "@testing-library/react";
import { FinancialFilters } from "@/components/financials/financial-filters";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams("period=month&coachId=coach-1"),
}));

const props = {
  coaches: [{ id: "coach-1", firstName: "Maria", lastName: "Lee" }],
  categories: [{ id: "category-1", name: "Growth" }],
};

it("sizes and stacks every financial filter control only when responsive mode is enabled", () => {
  const enabled = render(<FinancialFilters {...props} responsiveEnabled />);
  const monthly = screen.getByRole("button", { name: "Monthly" });
  expect(monthly.parentElement?.parentElement).toHaveClass("flex-col sm:flex-row");
  for (const name of ["Monthly", "Quarterly", "Annual", "All Time", "Clear filters"]) {
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-11");
  }
  for (const field of ["Coach", "Category", "From", "To"]) {
    expect(screen.getByLabelText(field)).toHaveClass("min-h-11");
  }
  enabled.unmount();

  render(<FinancialFilters {...props} />);
  expect(screen.getByRole("button", { name: "Monthly" }).parentElement?.parentElement).toHaveAttribute(
    "class",
    "flex flex-wrap items-end gap-3",
  );
  expect(screen.getByRole("button", { name: "Monthly" })).not.toHaveClass("min-h-11");
  expect(screen.getByLabelText("Coach")).toHaveAttribute(
    "class",
    "rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground",
  );
});
