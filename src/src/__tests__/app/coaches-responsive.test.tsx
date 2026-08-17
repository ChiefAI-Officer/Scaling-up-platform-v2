import { fireEvent, render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

const coach = {
  id: "coach-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  certificationStatus: "ACTIVE",
  certifications: [{ id: "cert-1", workshopType: { name: "Scaling Up" } }],
  _count: { workshops: 3 },
};

const mockFindMany = jest.fn().mockResolvedValue([coach]);
jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

import CoachesPage from "@/app/(dashboard)/coaches/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(false);
  mockFindMany.mockResolvedValue([coach]);
});

it("preserves the coaches desktop table when the responsive flag is off", async () => {
  render(await CoachesPage());

  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Coaches" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Ada Lovelace" })).not.toHaveClass("min-h-11");
});

it("renders coach identity, status, workshop count, and actions in compact records", async () => {
  mockResponsiveFlag.mockReturnValue(true);
  render(await CoachesPage());

  const list = screen.getByRole("list", { name: "Coaches" });
  expect(list).toHaveTextContent("Ada Lovelace");
  expect(list).toHaveTextContent("ada@example.com");
  expect(list).toHaveTextContent("ACTIVE");
  expect(list).toHaveTextContent("3");

  expect(screen.getByRole("link", { name: "View coach" })).toHaveAttribute("href", "/coaches/coach-1");
  expect(screen.getByRole("link", { name: "View coach" })).toHaveClass("min-h-11");
  fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Ada Lovelace" }), { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Edit coach" })).toHaveAttribute("href", "/coaches/coach-1/edit");
});
