import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContactsTable } from "@/components/contacts/contacts-table";

const contacts = [
  {
    id: "contact-1",
    kajabiId: "kajabi-1",
    name: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    emailMarketing: "Subscribed",
    lifetimeValue: 1250,
    addedAt: new Date("2026-08-01T00:00:00.000Z"),
    lastActivityAt: new Date("2026-08-05T00:00:00.000Z"),
    tags: "Founder, Lead",
    products: "Scaling Up Workshop",
    avatar: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-05T00:00:00.000Z"),
  },
];

describe("ContactsTable responsive presentation", () => {
  it("keeps the desktop table as the only collection DOM when disabled", () => {
    render(<ContactsTable data={contacts} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Contacts" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search Contacts...").closest("div")?.parentElement)
      .toHaveClass("flex items-center justify-between");
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toHaveAttribute(
        "class",
        "h-4 w-4 rounded border border-border text-primary focus:ring-primary ",
      );
      expect(checkbox).not.toHaveAttribute("aria-label");
      expect(checkbox.closest("label")).toBeNull();
    }
  });

  it("shows every existing contact field and action in compact records", () => {
    render(<ContactsTable data={contacts} responsiveEnabled />);

    const list = screen.getByRole("list", { name: "Contacts" });
    expect(list).toHaveTextContent("Ada Lovelace");
    expect(list).toHaveTextContent("ada@example.com");
    expect(list).toHaveTextContent("Subscribed");
    expect(list).toHaveTextContent("$1,250.00");
    expect(list).toHaveTextContent("Aug 1, 2026");
    expect(list).toHaveTextContent("Aug 5, 2026");

    const primary = screen.getByRole("button", { name: "View details" });
    expect(primary).toHaveClass("min-h-11");
    fireEvent.keyDown(within(list).getByRole("button", { name: "More actions for Ada Lovelace" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Edit contact" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("keeps the retained responsive wide contact action at 44px", () => {
    render(<ContactsTable data={contacts} responsiveEnabled />);

    const wide = screen.getByTestId("responsive-wide-view");
    const trigger = within(wide).getByRole("button", { name: "More actions for Ada Lovelace" });
    expect(trigger).toHaveClass("min-h-11 min-w-11");
    fireEvent.click(trigger);
    for (const action of ["View details", "Edit contact", "Delete"]) {
      expect(within(wide).getByRole("button", { name: action })).toHaveClass("min-h-11");
    }
  });

  it("gives both retained wide selection checkboxes labeled 44px targets", () => {
    render(<ContactsTable data={contacts} responsiveEnabled />);

    const wide = screen.getByTestId("responsive-wide-view");
    for (const name of ["Select all contacts", "Select Ada Lovelace"]) {
      const checkbox = within(wide).getByRole("checkbox", { name });
      expect(checkbox).toHaveClass("h-4 w-4");
      expect(checkbox.closest("label")).toHaveClass("inline-flex min-h-11 min-w-11");
    }
  });
});
