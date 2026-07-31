import { readFileSync } from "fs";
import path from "path";
import {
  drainStableInvitationRejectionRepairOutbox,
  isStableInvitationRejectionRepairResolved,
  listPendingStableInvitationRejectionRepairs,
  markStableInvitationRejectionRepairResolved,
  persistStableInvitationRejectionRepairPending,
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
            row.entityType === where.entityType &&
            row.entityId === where.entityId &&
            row.action === where.action
          ) {
            row.action = data.action;
            count += 1;
          }
        }
        return { count };
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
          markResolved: (input) =>
            markStableInvitationRejectionRepairResolved(db, {
              ...input,
              performedBy: "system:event",
            }),
        },
        intent,
      ),
    ).rejects.toThrow("event worker exhausted");
    expect(
      await listPendingStableInvitationRejectionRepairs(db, 25),
    ).toHaveLength(1);

    await expect(
      drainStableInvitationRejectionRepairOutbox(
        { db, quarantine, reconcile },
        { limit: 25 },
      ),
    ).resolves.toMatchObject({ failed: 0, resolved: 1 });
  });

  it("removes resolved duplicate intents from future bounded selections", async () => {
    const { db, rows } = createAuditHarness();
    const intent = { invitationId: "inv-3", tokenId: "token-3" };
    await persistStableInvitationRejectionRepairPending(db, {
      ...intent,
      performedBy: "system:first",
    });
    rows.push({
      id: "duplicate-pending",
      entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
      entityId: intent.tokenId,
      action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      performedBy: "system:duplicate",
      changes: JSON.stringify({ invitationId: intent.invitationId }),
      timestamp: new Date(Date.UTC(2026, 6, 31, 0, 0, 2)),
    });
    await markStableInvitationRejectionRepairResolved(db, {
      ...intent,
      performedBy: "system:event",
    });

    const quarantine = jest.fn();
    const reconcile = jest.fn();
    await expect(
      drainStableInvitationRejectionRepairOutbox(
        { db, quarantine, reconcile },
        { limit: 25 },
      ),
    ).resolves.toEqual({
      selected: 0,
      resolved: 0,
      skipped: 0,
      failed: 0,
    });
    expect(quarantine).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
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

  it("registers both the direct handler and scheduled drain", () => {
    const route = readFileSync(
      path.join(process.cwd(), "src", "app", "api", "inngest", "route.ts"),
      "utf8",
    );
    expect(route).toContain("stableInvitationRejectionRetry");
    expect(route).toContain("stableInvitationRejectionRepairCron");
  });
});
