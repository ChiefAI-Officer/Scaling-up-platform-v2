import { rotateUserPassword } from "@/lib/auth/password-credentials";

describe("rotateUserPassword", () => {
  function harness() {
    return {
      user: {
        update: jest.fn().mockResolvedValue({ id: "user-1", authVersion: 4 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
  }

  it("updates the hash, increments authVersion, and audits in the supplied transaction", async () => {
    const tx = harness();

    const result = await rotateUserPassword(tx as never, {
      userId: "user-1",
      passwordHash: "hashed-secret",
      action: "ADMIN_PASSWORD_SET",
      performedBy: "admin@example.com",
      changes: { coachId: "coach-1", role: "COACH" },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: "hashed-secret",
        authVersion: { increment: 1 },
      },
      select: { id: true, authVersion: true },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "User",
        entityId: "user-1",
        action: "ADMIN_PASSWORD_SET",
        performedBy: "admin@example.com",
        changes: JSON.stringify({ coachId: "coach-1", role: "COACH" }),
      },
    });
    expect(result).toEqual({ id: "user-1", authVersion: 4 });
  });

  it("does not write an audit row if the credential update fails", async () => {
    const tx = harness();
    tx.user.update.mockRejectedValue(new Error("database unavailable"));

    await expect(
      rotateUserPassword(tx as never, {
        userId: "user-1",
        passwordHash: "hashed-secret",
        action: "PASSWORD_RESET",
        performedBy: "coach@example.com",
      }),
    ).rejects.toThrow("database unavailable");

    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
