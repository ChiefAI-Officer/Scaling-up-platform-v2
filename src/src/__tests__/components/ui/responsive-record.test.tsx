import { render, screen } from "@testing-library/react";
import { ResponsiveActionsItem } from "@/components/ui/responsive-actions-menu";
import {
  ResponsiveRecord,
  ResponsiveRecordActions,
  ResponsiveRecordHeader,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";

it("renders semantic record metadata and keeps primary and secondary actions reachable", () => {
  render(
    <ResponsiveRecord>
      <ResponsiveRecordHeader title="Acme" status={<span>Active</span>} />
      <ResponsiveRecordMeta
        items={[
          { label: "Owner", value: "Maria" },
          { label: "Members", value: 12 },
        ]}
      />
      <ResponsiveRecordActions
        primary={<a href="/acme">Open</a>}
        secondary={
          <ResponsiveActionsItem asChild>
            <button>Archive</button>
          </ResponsiveActionsItem>
        }
      />
    </ResponsiveRecord>,
  );

  expect(screen.getByRole("article")).toHaveClass("min-w-0");
  expect(screen.getByText("Owner")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open" })).toHaveClass("min-h-11");
  expect(
    screen.getByRole("button", { name: /more actions/i }),
  ).toBeInTheDocument();
});

it("forwards article accessibility attributes to the real record", () => {
  render(<ResponsiveRecord aria-label="Acme record">Acme</ResponsiveRecord>);
  expect(screen.getByRole("article", { name: "Acme record" })).toBeInTheDocument();
});
