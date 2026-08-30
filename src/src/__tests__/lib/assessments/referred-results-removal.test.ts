import type { ApiActor } from "@/lib/auth/access-control";
import { removeReferredResult } from "@/lib/assessments/referred-results-removal";

const now = new Date("2026-08-30T10:00:00.000Z");
const actor: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function makeDb(input?: {
  certificationStatus?: string;
  certificationExpiry?: Date | null;
  updatedCount?: number;
  auditError?: Error;
}) {
  const coachFindUnique = jest.fn().mockResolvedValue({
    certificationStatus: input?.certificationStatus ?? "ACTIVE",
    certificationExpiry: input?.certificationExpiry ?? null,
  });
  const updateMany = jest.fn().mockResolvedValue({
    count: input?.updatedCount ?? 1,
  });
  const auditCreate = input?.auditError
    ? jest.fn().mockRejectedValue(input.auditError)
    : jest.fn().mockResolvedValue({ id: "audit-1" });
  const tx = {
    coach: { findUnique: coachFindUnique },
    assessmentSubmission: { updateMany },
    auditLog: { create: auditCreate },
  };
  const $transaction = jest.fn(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );

  return {
    db: { $transaction },
    tx,
  };
}

const context = {
  now,
  requestId: "request-1",
  ipAddress: "203.0.113.8",
  userAgent: "test-agent",
};

describe("removeReferredResult", () => {
  it("rejects a non-Coach actor before opening a transaction", async () => {
    const { db } = makeDb();

    await expect(
      removeReferredResult(
        db,
        { ...actor, role: "STAFF" },
        "sub-1",
        context,
      ),
    ).resolves.toBe("forbidden");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("atomically tombstones one active Coach-owned Public submission and audits bounded metadata", async () => {
    const { db, tx } = makeDb();

    await expect(
      removeReferredResult(db, actor, "sub-1", context),
    ).resolves.toBe("removed");

    expect(tx.coach.findUnique).toHaveBeenCalledWith({
      where: { id: "coach-1" },
      select: {
        certificationStatus: true,
        certificationExpiry: true,
      },
    });
    expect(tx.assessmentSubmission.updateMany).toHaveBeenCalledWith({
      where: {
        id: "sub-1",
        referringCoachId: "coach-1",
        referredResultsDeletedAt: null,
        campaign: { accessMode: "PUBLIC", deletedAt: null },
      },
      data: { referredResultsDeletedAt: now },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "AssessmentSubmission",
        entityId: "sub-1",
        action: "DELETE",
        performedBy: "coach@example.com",
        changes: JSON.stringify({
          kind: "referred-results-removal",
          softDelete: true,
          requestId: "request-1",
        }),
        ipAddress: "203.0.113.8",
        userAgent: "test-agent",
      },
    });
  });

  it.each([
    ["inactive", { certificationStatus: "DEACTIVATED" }],
    [
      "expired",
      { certificationExpiry: new Date("2026-08-30T09:59:59.000Z") },
    ],
  ])("returns forbidden for an %s Coach", async (_label, input) => {
    const { db, tx } = makeDb(input);

    await expect(
      removeReferredResult(db, actor, "sub-1", context),
    ).resolves.toBe("forbidden");
    expect(tx.assessmentSubmission.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("folds every unavailable or unauthorized submission into not-found", async () => {
    const { db, tx } = makeDb({ updatedCount: 0 });

    await expect(
      removeReferredResult(db, actor, "sub-foreign", context),
    ).resolves.toBe("not-found");
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("propagates audit failure so the transaction cannot commit the tombstone", async () => {
    const auditError = new Error("audit unavailable");
    const { db, tx } = makeDb({ auditError });

    await expect(
      removeReferredResult(db, actor, "sub-1", context),
    ).rejects.toBe(auditError);
    expect(tx.assessmentSubmission.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
