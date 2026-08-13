import { render, screen } from "@testing-library/react";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";

it("renders only the existing wide view when the gate is off", () => {
  render(
    <ResponsiveDataView
      enabled={false}
      label="Workshops"
      compact={<p>Cards</p>}
      wide={<p>Table</p>}
    />,
  );

  expect(screen.getByText("Table")).toBeInTheDocument();
  expect(screen.queryByText("Cards")).not.toBeInTheDocument();
});

it("renders labeled compact and wide presenters when enabled", () => {
  render(
    <ResponsiveDataView
      enabled
      label="Workshops"
      compact={<p>Cards</p>}
      wide={<p>Table</p>}
      wideFrom="lg"
    />,
  );

  expect(screen.getByRole("list", { name: "Workshops" })).toHaveClass("lg:hidden");
  expect(screen.getByTestId("responsive-wide-view")).toHaveClass("hidden");
  expect(screen.getByTestId("responsive-wide-view")).toHaveClass("lg:block");
});
