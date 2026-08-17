import { fireEvent, render, screen } from "@testing-library/react";
import {
  ResponsiveActionsItem,
  ResponsiveActionsMenu,
} from "@/components/ui/responsive-actions-menu";

it("exposes secondary actions from a 44px labeled trigger", () => {
  render(
    <ResponsiveActionsMenu label="More workshop actions">
      <ResponsiveActionsItem asChild>
        <button>Edit workshop</button>
      </ResponsiveActionsItem>
    </ResponsiveActionsMenu>,
  );

  const trigger = screen.getByRole("button", { name: "More workshop actions" });
  expect(trigger).toHaveClass("min-h-11");
  expect(trigger).toHaveClass("min-w-11");

  fireEvent.keyDown(trigger, { key: "ArrowDown" });

  expect(screen.getByRole("menuitem", { name: "Edit workshop" })).toBeVisible();
});
