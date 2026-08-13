import { fireEvent, render, screen } from "@testing-library/react";
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
      .toHaveClass("flex", "items-center", "justify-between");
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
    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Ada Lovelace" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Edit contact" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });
});
