import { render, screen } from "@testing-library/react";
import { NewCoachForm } from "@/app/(dashboard)/coaches/new/new-coach-form";

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {}));
});

it("changes form and target sizing only when responsive mode is explicitly enabled", () => {
  const { container, rerender } = render(<NewCoachForm />);
  expect(container.querySelector("[data-responsive-page-header]")).not.toBeInTheDocument();
  expect(screen.getByLabelText("First Name *")).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Create Coach" })).not.toHaveClass("min-h-11");

  rerender(<NewCoachForm responsiveEnabled />);
  expect(container.querySelector("[data-responsive-page-header]")).toBeInTheDocument();
  expect(screen.getByLabelText("First Name *")).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Create Coach" })).toHaveClass("min-h-11");
});
