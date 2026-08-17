import { render, screen, within } from "@testing-library/react";
import { RegistrationsTable } from "@/app/(dashboard)/admin/registrations/registrations-table";

const registration = {
  id: "registration-1",
  workshopId: "workshop-1",
  firstName: "Maria",
  lastName: "Lee",
  email: "maria.long.address@example.com",
  company: "Growth Co",
  phone: "+1 555 0100",
  paymentStatus: "COMPLETED",
  attended: true,
  createdAt: "2026-08-12T00:00:00.000Z",
  workshop: {
    title: "Scaling Up Masterclass",
    eventDate: "2026-09-01T00:00:00.000Z",
    coach: {
      firstName: "Alex",
      lastName: "Coach",
      email: "alex@example.com",
    },
  },
};

it("preserves the registration table DOM and classes when responsive mode is disabled", () => {
  const { container } = render(<RegistrationsTable registrations={[registration]} />);

  expect(screen.queryByRole("list", { name: "Registrations" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("Search by name or email...").parentElement).toHaveAttribute(
    "class",
    "flex items-center gap-4",
  );
  expect(screen.getByRole("table").parentElement?.parentElement).toHaveAttribute(
    "class",
    "rounded-lg border border-border bg-card overflow-hidden",
  );
  expect(container.querySelector("[data-responsive-data-region]")).toBeNull();
});

it("renders the real registration identity and workshop action in compact records", () => {
  render(<RegistrationsTable registrations={[registration]} responsiveEnabled />);

  const list = screen.getByRole("list", { name: "Registrations" });
  expect(list).toHaveTextContent("Maria Lee");
  expect(list).toHaveTextContent("maria.long.address@example.com");
  expect(list).toHaveTextContent("Growth Co");
  expect(list).toHaveTextContent("+1 555 0100");
  expect(list).toHaveTextContent("Scaling Up Masterclass");
  expect(list).toHaveTextContent("Alex Coach");
  expect(list).toHaveTextContent("COMPLETED");
  expect(list).toHaveTextContent("Attended");

  const open = within(list).getByRole("link", { name: "Open workshop" });
  expect(open).toHaveAttribute("href", "/workshops/workshop-1");
  expect(open).toHaveClass("min-h-11");
  expect(screen.getByPlaceholderText("Search by name or email...")).toHaveClass("min-h-11");
  expect(screen.getByRole("region", { name: "Registrations table" })).toHaveClass("overflow-x-auto");
});
