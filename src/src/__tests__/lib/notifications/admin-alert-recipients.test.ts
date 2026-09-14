jest.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { resolveAdminAlertRecipients } from "@/lib/notifications/admin-alert-recipients";

const mockFindMany = db.user.findMany as jest.Mock;

describe("resolveAdminAlertRecipients", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAIL = "fallback@example.com";
  });

  afterAll(() => {
    if (originalAdminEmail === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = originalAdminEmail;
    }
  });

  it("returns distinct normalized emails for live human ADMIN and STAFF users", async () => {
    mockFindMany.mockResolvedValue([
      { email: " Admin@Example.com " },
      { email: "admin@example.com" },
      { email: "staff@example.com" },
    ]);

    await expect(resolveAdminAlertRecipients()).resolves.toEqual([
      "admin@example.com",
      "staff@example.com",
    ]);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        role: { in: ["ADMIN", "STAFF"] },
        deletedAt: null,
        passwordHash: { not: null },
      },
      select: { email: true },
    });
  });

  it("falls back to ADMIN_EMAIL when no live human admin or staff users exist", async () => {
    mockFindMany.mockResolvedValue([]);

    await expect(resolveAdminAlertRecipients()).resolves.toEqual([
      "fallback@example.com",
    ]);
  });

  it("falls back instead of silently dropping alerts when the user query fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockFindMany.mockRejectedValue(new Error("database unavailable"));

    await expect(resolveAdminAlertRecipients()).resolves.toEqual([
      "fallback@example.com",
    ]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
