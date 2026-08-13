/**
 * Wave Q (#7, ADR-0018) — (dashboard)/layout.tsx liveness check.
 *
 * The layout adds ONE db.user.findUnique({ select: { deletedAt } }) after the
 * session/role checks and redirects removed (or vanished) users to /login.
 * UNCONDITIONAL: tests run with the WAVE_Q flag env vars DELETED.
 */

import { render, screen } from "@testing-library/react";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

const redirectMock = jest.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
jest.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/nav/admin-nav-badges", () => ({
  getAdminNavBadgeCounts: jest.fn().mockResolvedValue({}),
}));

const mockResponsiveFlag = jest.fn(() => false);
jest.mock("@/lib/mobile-responsive-flags", () => ({
  isMobileResponsiveEnabled: () => mockResponsiveFlag(),
}));

jest.mock("@/components/layout/admin-mobile-nav", () => ({
  AdminMobileNav: () => null,
}));
jest.mock("@/components/layout/admin-nav-links", () => ({
  AdminNavLinks: () => null,
}));
jest.mock("@/components/layout/sign-out-button", () => ({
  SignOutButton: () => null,
}));
jest.mock("@/components/ui/separator", () => ({
  Separator: () => null,
}));
jest.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import DashboardLayout from "@/app/(dashboard)/layout";

const SESSION = {
  user: { id: "u-1", email: "admin@example.com", name: "Admin", role: "ADMIN" },
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
  delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
  mockResponsiveFlag.mockReturnValue(false);
  (getServerSession as jest.Mock).mockResolvedValue(SESSION);
});

describe("(dashboard)/layout — liveness", () => {
  it("renders for a live admin (single deletedAt select on the users table)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ deletedAt: null });

    const jsx = await DashboardLayout({ children: null });

    expect(jsx).toBeTruthy();
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: { deletedAt: true },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects a soft-removed admin to /login (flag OFF — unconditional)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      deletedAt: new Date("2026-07-01"),
    });

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/login"
    );
  });

  it("redirects to /login when the user row is missing entirely (fail closed)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/login"
    );
  });

  it("regression: no session still redirects to /login before touching the DB", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/login"
    );
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("regression: a COACH session still redirects to /unauthorized", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { ...SESSION.user, role: "COACH" },
    });

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/unauthorized"
    );
  });

  it("only enlarges the dashboard wordmark target behind the responsive flag", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({ deletedAt: null });

    render(await DashboardLayout({ children: null }));
    expect(screen.getByRole("link", { name: "Scaling Up - Go to Dashboard" })).not.toHaveClass("min-h-11");

    mockResponsiveFlag.mockReturnValue(true);
    render(await DashboardLayout({ children: null }));
    expect(screen.getAllByRole("link", { name: "Scaling Up - Go to Dashboard" })[1]).toHaveClass("min-h-11");
  });
});
