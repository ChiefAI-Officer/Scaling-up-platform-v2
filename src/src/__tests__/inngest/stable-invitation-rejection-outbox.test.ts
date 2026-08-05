import { readFileSync } from "fs";
import path from "path";
import {
  drainStableInvitationRejectionRepairOutbox,
  isStableInvitationRejectionRepairResolved,
  listPendingStableInvitationRejectionRepairs,
  markStableInvitationRejectionRepairResolved,
  persistStableInvitationRejectionRepairPending,
  stableInvitationRejectionRepairTargetExists,
  STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
  STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
  STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION,
  type StableInvitationRejectionOutboxDb,
} from "@/lib/assessments/stable-invitation-rejection-outbox";
import { runStableInvitationRejectionRetry } from "@/inngest/functions/stable-invitation-rejection-retry";

type AuditRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string | null;
  changes: string;
  timestamp: Date;
};

function createAuditHarness() {
  const rows: AuditRow[] = [];
  let clock = 0;
  const db = {
    auditLog: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `audit-${rows.length + 1}`,
          ...data,
          performedBy: data.performedBy ?? null,
          timestamp: new Date(Date.UTC(2026, 6, 31, 0, 0, clock++)),
        };
        rows.push(row);
        return row;
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const existing = rows.find((row) => row.id === where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = {
          ...create,
          performedBy: create.performedBy ?? null,
          timestamp: new Date(Date.UTC(2026, 6, 31, 0, 0, clock++)),
        };
        rows.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (
            (where.id === undefined || row.id === where.id) &&
            (where.entityType === undefined ||
              row.entityType === where.entityType) &&
            (where.entityId === undefined || row.entityId === where.entityId) &&
            (where.action === undefined || row.action === where.action)
          ) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
      count: jest.fn(async ({ where }) => {
        return rows.filter(
          (row) =>
            row.entityType === where.entityType &&
            row.entityId === where.entityId &&
            row.action === where.action,
        ).length;
      }),
      findUnique: jest.fn(async ({ where }) => {
        return rows.find((row) => row.id === where.id) ?? null;
      }),
      findMany: jest.fn(async ({ where, take }) => {
        return rows
          .filter(
            (row) =>
              row.entityType === where.entityType &&
              row.action === where.action,
          )
          .sort(
            (a, b) =>
              a.timestamp.getTime() - b.timestamp.getTime() ||
              a.id.localeCompare(b.id),
          )
          .slice(0, take);
      }),
    },
  } as unknown as StableInvitationRejectionOutboxDb;
  db.$transaction = jest.fn(async (callback) => callback(db));
  return { db, rows };
}

describe("stable invitation rejection audit outbox", () => {
  it("survives a rejected fast-path event and later converges through the scheduled drain", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-1", tokenId: "token-1" };

    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:test",
    });
    await expect(
      Promise.reject(new Error("Inngest event submission unavailable")),
    ).rejects.toThrow("event submission unavailable");

    const quarantine = jest.fn().mockResolvedValue(undefined);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const firstDrain = await drainStableInvitationRejectionRepairOutbox(
      {
        db,
        targetExists: jest.fn().mockResolvedValue(true),
        quarantine,
        reconcile,
      },
      { limit: 25 },
    );

    expect(firstDrain).toEqual({
      selected: 1,
      resolved: 1,
      skipped: 0,
      failed: 0,
    });
    expect(quarantine).toHaveBeenCalledWith(intent);
    expect(reconcile).toHaveBeenCalledWith(intent);
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: "token-1",
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
        performedBy: "system:test",
        changes: JSON.stringify({ invitationId: "inv-1" }),
      },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
          entityId: "token-1",
          action: STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION,
          changes: JSON.stringify({ invitationId: "inv-1" }),
        }),
      ]),
    );
  });

  it("leaves an exhausted event-worker intent pending for a later cron convergence", async () => {
    const { db } = createAuditHarness();
    const intent = { invitationId: "inv-2", tokenId: "token-2" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:test",
    });

    const quarantine = jest
      .fn()
      .mockRejectedValueOnce(new Error("event worker exhausted"))
      .mockResolvedValue(undefined);
    const reconcile = jest.fn().mockResolvedValue(undefined);

    await expect(
      runStableInvitationRejectionRetry(
        {
          quarantine,
          reconcile,
          isResolved: (input) =>
            isStableInvitationRejectionRepairResolved(db, input),
          targetExists: jest.fn().mockResolvedValue(true),
          markResolved: (input) =>
            markStableInvitationRejectionRepairResolved(db, {
              ...input,
              performedBy: "system:event",
            }),
          markTerminal: jest.fn(),
        },
        intent,
      ),
    ).rejects.toThrow("event worker exhausted");
    expect(
      await listPendingStableInvitationRejectionRepairs(db, 25),
    ).toHaveLength(1);

    await expect(
      drainStableInvitationRejectionRepairOutbox(
        {
          db,
          targetExists: jest.fn().mockResolvedValue(true),
          quarantine,
          reconcile,
        },
        { limit: 25 },
      ),
    ).resolves.toMatchObject({ failed: 0, resolved: 1 });
  });

  it("sweeps a duplicate pending intent created after its resolved marker", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-3", tokenId: "token-3" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:first",
    });
    await markStableInvitationRejectionRepairResolved(db, {
      ...intent,
      performedBy: "system:event",
    });
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:duplicate",
    });

    const quarantine = jest.fn();
    const reconcile = jest.fn();
    await expect(
      drainStableInvitationRejectionRepairOutbox(
        {
          db,
          targetExists: jest.fn().mockResolvedValue(true),
          quarantine,
          reconcile,
        },
        { limit: 25 },
      ),
    ).resolves.toEqual({
      selected: 1,
      resolved: 0,
      skipped: 1,
      failed: 0,
    });
    expect(quarantine).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(
      rows.filter(
        (row) =>
          row.action === STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      ),
    ).toHaveLength(0);
  });

  it("terminalizes a deleted token or invitation because its credential cannot authenticate", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-deleted", tokenId: "token-deleted" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:test",
    });
    const quarantine = jest.fn();
    const reconcile = jest.fn();
    const deps = {
      db,
      quarantine,
      reconcile,
      targetExists: jest.fn().mockResolvedValue(false),
    };

    await expect(
      drainStableInvitationRejectionRepairOutbox(deps),
    ).resolves.toMatchObject({
      selected: 1,
      resolved: 1,
      failed: 0,
    });

    expect(quarantine).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(
      rows.filter(
        (row) =>
          row.action === "STABLE_INVITATION_REJECTION_REPAIR_PENDING",
      ),
    ).toHaveLength(0);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: intent.tokenId,
          action: "STABLE_INVITATION_REJECTION_REPAIR_TERMINAL",
          changes: JSON.stringify({
            invitationId: intent.invitationId,
            reason: "TARGET_DELETED",
          }),
        }),
      ]),
    );
  });

  it("dead-letters malformed metadata and consumes the pending row", async () => {
    const { db, rows } = createAuditHarness();
    rows.push({
      id: "malformed-pending",
      entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
      entityId: "token-malformed",
      action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      performedBy: "system:test",
      changes: JSON.stringify({ unexpected: "value" }),
      timestamp: new Date(Date.UTC(2026, 6, 31, 0, 0, 0)),
    });
    const quarantine = jest.fn();
    const reconcile = jest.fn();

    await expect(
      drainStableInvitationRejectionRepairOutbox({
        db,
        targetExists: jest.fn().mockResolvedValue(true),
        quarantine,
        reconcile,
      }),
    ).resolves.toMatchObject({
      selected: 1,
      skipped: 1,
      failed: 0,
    });

    expect(quarantine).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(
      rows.filter(
        (row) =>
          row.action === "STABLE_INVITATION_REJECTION_REPAIR_PENDING",
      ),
    ).toHaveLength(0);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "j65_rejection_repair_terminal:malformed-pending",
          action: "STABLE_INVITATION_REJECTION_REPAIR_TERMINAL",
          changes: JSON.stringify({ reason: "MALFORMED_METADATA" }),
        }),
      ]),
    );
  });

  it("records and rotates a transient repair failure to the tail", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-transient", tokenId: "token-transient" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:test",
    });
    const quarantine = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary database outage"))
      .mockResolvedValue(undefined);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const deps = {
      db,
      quarantine,
      reconcile,
      targetExists: jest.fn().mockResolvedValue(true),
    };

    await expect(
      drainStableInvitationRejectionRepairOutbox(deps),
    ).resolves.toMatchObject({
      selected: 1,
      failed: 1,
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT",
          changes: JSON.stringify({
            invitationId: intent.invitationId,
            attemptCount: 1,
            reason: "TRANSIENT_REPAIR_FAILURE",
          }),
        }),
        expect.objectContaining({
          id: "j65_rejection_repair_pending:token-transient:1",
          action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
          changes: JSON.stringify({ invitationId: intent.invitationId }),
        }),
      ]),
    );
    expect(
      rows.filter(
        (row) =>
          row.action === STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(
      /rawToken|tokenHash|previousToken|temporary database outage/i,
    );

    await expect(
      drainStableInvitationRejectionRepairOutbox(deps),
    ).resolves.toMatchObject({
      selected: 1,
      resolved: 1,
      failed: 0,
    });
  });

  it("lets a concurrent event resolution consume a failing cron row without another retry", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-race", tokenId: "token-race" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:test",
    });
    const quarantine = jest.fn(async () => {
      await markStableInvitationRejectionRepairResolved(db, {
        ...intent,
        performedBy: "system:event",
      });
      throw new Error("cron observed a stale failure");
    });

    await expect(
      drainStableInvitationRejectionRepairOutbox({
        db,
        targetExists: jest.fn().mockResolvedValue(true),
        quarantine,
        reconcile: jest.fn(),
      }),
    ).resolves.toEqual({
      selected: 1,
      resolved: 0,
      skipped: 1,
      failed: 0,
    });
    expect(
      rows.filter(
        (row) =>
          row.action === STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION ||
          row.action ===
            "STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT",
      ),
    ).toHaveLength(0);
  });

  it("moves fifty transient head rows behind row fifty-one within the next bounded drain", async () => {
    const { db } = createAuditHarness();
    for (let index = 0; index < 50; index += 1) {
      await persistStableInvitationRejectionRepairPending(db, {
        invitationId: `inv-poison-${index}`,
        tokenId: `token-poison-${index}`,
        performedBy: "system:test",
      });
    }
    const valid = { invitationId: "inv-valid", tokenId: "token-valid" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...valid,
      performedBy: "system:test",
    });
    const quarantine = jest.fn(async (input) => {
      if (input.tokenId.startsWith("token-poison-")) {
        throw new Error("transient repair failure");
      }
    });
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const deps = {
      db,
      quarantine,
      reconcile,
      targetExists: jest.fn().mockResolvedValue(true),
    };

    await expect(
      drainStableInvitationRejectionRepairOutbox(deps),
    ).resolves.toMatchObject({
      selected: 50,
      failed: 50,
    });
    expect(quarantine).not.toHaveBeenCalledWith(valid);

    await expect(
      drainStableInvitationRejectionRepairOutbox(deps),
    ).resolves.toMatchObject({
      selected: 50,
      resolved: 1,
    });
    expect(quarantine).toHaveBeenCalledWith(valid);
    expect(reconcile).toHaveBeenCalledWith(valid);
  });

  it("persists only the token-row ID and invitation ID", async () => {
    const { db, rows } = createAuditHarness();
    await persistStableInvitationRejectionRepairPending(db, {
      invitationId: "inv-private",
      tokenId: "token-private",
      performedBy: "system:test",
    });

    const serialized = JSON.stringify(rows);
    expect(serialized).toContain("inv-private");
    expect(serialized).toContain("token-private");
    expect(serialized).not.toMatch(/rawToken|tokenHash|previousToken/i);
  });

  it("checks both token-row identity and invitation identity before repair", async () => {
    const db = {
      assessmentInvitationToken: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ invitationId: "inv-match" })
          .mockResolvedValueOnce({ invitationId: "inv-other" })
          .mockResolvedValueOnce(null),
      },
    };
    const input = { invitationId: "inv-match", tokenId: "token-match" };

    await expect(
      stableInvitationRejectionRepairTargetExists(db, input),
    ).resolves.toBe(true);
    await expect(
      stableInvitationRejectionRepairTargetExists(db, input),
    ).resolves.toBe(false);
    await expect(
      stableInvitationRejectionRepairTargetExists(db, input),
    ).resolves.toBe(false);
    expect(db.assessmentInvitationToken.findUnique).toHaveBeenCalledWith({
      where: { id: input.tokenId },
      select: { invitationId: true },
    });
  });

  it("registers both the direct handler and scheduled drain", () => {
    const route = readFileSync(
      path.join(process.cwd(), "src", "app", "api", "inngest", "route.ts"),
      "utf8",
    );
    expect(route).toContain("stableInvitationRejectionRetry");
    expect(route).toContain("stableInvitationRejectionRepairCron");
  });
});
