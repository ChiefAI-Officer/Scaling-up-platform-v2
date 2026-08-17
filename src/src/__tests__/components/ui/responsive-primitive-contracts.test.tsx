import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

it("preserves the page header markup when responsive behavior is off", () => {
  const { container } = render(<PageHeader title="Workshops" actions={<button>Add</button>} />);
  const header = container.firstElementChild;

  expect(header).toHaveClass("flex");
  expect(header).toHaveClass("flex-col");
  expect(header).toHaveClass("gap-1");
  expect(header).toHaveClass("sm:flex-row");
  expect(header).toHaveClass("sm:items-center");
  expect(header).toHaveClass("sm:justify-between");
  expect(header).toHaveClass("mb-6");
  expect(header).not.toHaveAttribute("data-responsive-page-header");
  expect(screen.getByRole("button", { name: "Add" }).parentElement).not.toHaveAttribute("data-responsive-actions");
});

it("adds responsive page-header hooks only when enabled", () => {
  const { container } = render(<PageHeader responsiveEnabled title="Workshops" actions={<button>Add</button>} />);

  expect(container.firstElementChild).toHaveAttribute("data-responsive-page-header");
  expect(screen.getByRole("button", { name: "Add" }).parentElement).toHaveAttribute("data-responsive-actions");
});

it("preserves the table wrapper when responsive behavior is off", () => {
  const { container } = render(
    <Table><TableBody><TableRow><TableCell>Workshop</TableCell></TableRow></TableBody></Table>,
  );
  const wrapper = container.firstElementChild;

  expect(wrapper).toHaveClass("relative");
  expect(wrapper).toHaveClass("w-full");
  expect(wrapper).toHaveClass("overflow-auto");
  expect(wrapper).toHaveClass("rounded-lg");
  expect(wrapper).toHaveClass("border");
  expect(wrapper).not.toHaveClass("max-w-full");
  expect(wrapper).not.toHaveAttribute("role");
  expect(wrapper).not.toHaveAttribute("data-responsive-data-region");
});

it("adds a labeled focusable table scroll region only when responsive behavior is enabled", () => {
  render(
    <Table responsiveEnabled regionLabel="Workshops table" containerClassName="wide-table">
      <TableBody><TableRow><TableCell>Workshop</TableCell></TableRow></TableBody>
    </Table>,
  );

  const region = screen.getByRole("region", { name: "Workshops table" });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region).toHaveAttribute("data-responsive-data-region");
  expect(region).toHaveClass("max-w-full");
  expect(region).toHaveClass("wide-table");
});

it("adds the tab scroll hook and label only when responsive behavior is enabled", () => {
  const { rerender } = render(
    <Tabs defaultValue="one"><TabsList><TabsTrigger value="one">One</TabsTrigger></TabsList></Tabs>,
  );
  expect(screen.getByRole("tablist")).not.toHaveAttribute("data-responsive-tabs");
  expect(screen.getByRole("tablist")).not.toHaveAttribute("aria-label");

  rerender(
    <Tabs defaultValue="one"><TabsList responsiveEnabled><TabsTrigger value="one">One</TabsTrigger></TabsList></Tabs>,
  );
  expect(screen.getByRole("tablist", { name: "Scrollable sections" })).toHaveAttribute("data-responsive-tabs");
});

it("enforces responsive tab hooks despite caller-provided overrides", () => {
  render(
    <Tabs defaultValue="one">
      <TabsList
        responsiveEnabled
        aria-label="Caller label"
        data-responsive-tabs={undefined}
      >
        <TabsTrigger value="one">One</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

  const tablist = screen.getByRole("tablist", { name: "Scrollable sections" });
  expect(tablist).toHaveAttribute("aria-label", "Scrollable sections");
  expect(tablist).toHaveAttribute("data-responsive-tabs");
});

it("preserves caller tab attributes and classes when responsive behavior is disabled", () => {
  render(
    <Tabs defaultValue="one">
      <TabsList
        responsiveEnabled={false}
        aria-label="Caller label"
        data-responsive-tabs="caller-marker"
        className="caller-tabs"
      >
        <TabsTrigger value="one">One</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

  const tablist = screen.getByRole("tablist", { name: "Caller label" });
  expect(tablist).toHaveAttribute("data-responsive-tabs", "caller-marker");
  expect(tablist).toHaveClass("flex");
  expect(tablist).toHaveClass("items-center");
  expect(tablist).toHaveClass("gap-5");
  expect(tablist).toHaveClass("border-b");
  expect(tablist).toHaveClass("border-border");
  expect(tablist).toHaveClass("overflow-x-auto");
  expect(tablist).toHaveClass("caller-tabs");
});

it("adds constrained dialog presentation and close target only when enabled", () => {
  const { rerender } = render(
    <Dialog open><DialogTrigger>Open</DialogTrigger><DialogContent aria-describedby={undefined}><DialogTitle>Workshop</DialogTitle></DialogContent></Dialog>,
  );
  expect(screen.getByRole("dialog")).not.toHaveAttribute("data-responsive-dialog");
  expect(screen.getByRole("button", { name: "Close" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Close" })).not.toHaveClass("min-w-11");

  rerender(
    <Dialog open><DialogTrigger>Open</DialogTrigger><DialogContent responsiveEnabled aria-describedby={undefined}><DialogTitle>Workshop</DialogTitle></DialogContent></Dialog>,
  );
  expect(screen.getByRole("dialog")).toHaveAttribute("data-responsive-dialog");
  expect(screen.getByRole("dialog")).toHaveClass("max-h-[calc(100dvh-2rem)]");
  expect(screen.getByRole("dialog")).toHaveClass("max-w-[calc(100vw-2rem)]");
  expect(screen.getByRole("dialog")).toHaveClass("overflow-y-auto");
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("min-w-11");
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("inline-flex");
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("items-center");
  expect(screen.getByRole("button", { name: "Close" })).toHaveClass("justify-center");
});
