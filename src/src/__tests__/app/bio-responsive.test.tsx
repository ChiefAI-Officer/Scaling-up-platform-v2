import { render, screen } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

const coach = {
  id: "coach-1",
  firstName: "Lynne",
  lastName: "Verdun",
  email: "lynne@example.com",
  title: "Master Coach",
  company: "A Step Above",
  bio: "A complete coach biography.",
  profileImage: "https://example.com/coach.png",
  linkedinUrl: "https://linkedin.com/in/coach",
  updatedAt: new Date("2026-08-11T00:00:00.000Z"),
};

const mockFindMany = jest.fn().mockResolvedValue([coach]);
jest.mock("@/lib/db", () => ({
  db: { coach: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

import BioPageIndex from "@/app/(dashboard)/bio/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponsiveFlag.mockReturnValue(false);
  mockFindMany.mockResolvedValue([coach]);
});
it("preserves the existing bio table when responsive mode is disabled", async () => {
  render(await BioPageIndex());

  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Coach bio profiles" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Edit Bio" })).not.toHaveClass("min-h-11");
});

it("renders bio title and completion with one truthful compact action", async () => {
  mockResponsiveFlag.mockReturnValue(true);
  render(await BioPageIndex());

  const list = screen.getByRole("list", { name: "Coach bio profiles" });
  expect(list).toHaveTextContent("Lynne Verdun");
  expect(list).toHaveTextContent("Master Coach");
  expect(list).toHaveTextContent("Complete");

  const action = screen.getByRole("link", { name: "View bio" });
  expect(action).toHaveAttribute("href", "/bio/coach-1");
  expect(action).toHaveClass("min-h-11");
  expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
});
