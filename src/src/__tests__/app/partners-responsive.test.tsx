import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PartnersClient } from "@/app/(dashboard)/partners/partners-client";

const payload = {
  partners: [
    {
      id: "partner-1",
      name: "Growth Partners",
      tagline: "Scale with confidence",
      description: "A trusted implementation partner.",
      logoUrl: "https://example.com/logo.png",
      isActive: true,
      updatedAt: "2026-08-12T00:00:00.000Z",
    },
  ],
  toggles: [],
  workshops: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({ success: true, data: payload }),
  });
});

it("preserves the existing partner list DOM when responsive mode is disabled", async () => {
  render(<PartnersClient />);
  expect((await screen.findAllByText("Growth Partners")).length).toBeGreaterThan(0);
  expect(screen.queryByRole("list", { name: "Partner profiles" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
});

it("uses the existing profile form as the compact primary entry and keeps mutations reachable", async () => {
  render(<PartnersClient responsiveEnabled />);

  const list = await screen.findByRole("list", { name: "Partner profiles" });
  expect(list).toHaveTextContent("Growth Partners");
  expect(list).toHaveTextContent("Active");
  expect(list).toHaveTextContent("Scale with confidence");
  expect(list).toHaveTextContent("A trusted implementation partner.");
  expect(list).toHaveTextContent("View logo");
  expect(list).toHaveTextContent("Updated Aug 12, 2026");

  const primary = screen.getByRole("button", { name: "Open profile" });
  expect(primary).toHaveClass("min-h-11");
  fireEvent.click(primary);
  await waitFor(() => expect(screen.getByLabelText("Partner Name")).toHaveValue("Growth Partners"));

  fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Growth Partners" }), { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Deactivate" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
});

it("sizes and stacks the retained responsive partner actions", async () => {
  render(<PartnersClient responsiveEnabled />);
  await screen.findByRole("list", { name: "Partner profiles" });

  const wide = screen.getByTestId("responsive-wide-view");
  const actions = within(wide).getByRole("button", { name: "Edit" }).parentElement;
  expect(actions).toHaveClass("flex-col sm:flex-row");
  for (const name of ["Edit", "Deactivate", "Delete"]) {
    expect(within(wide).getByRole("button", { name })).toHaveClass("min-h-11");
  }
});
