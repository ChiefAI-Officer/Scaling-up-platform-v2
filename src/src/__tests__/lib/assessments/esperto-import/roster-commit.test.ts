/**
 * Esperto historical import — roster commit (THE writer) unit tests.
 *
 * Spec ref: plan 12a step 7, S1 (additive + non-overwriting), §17 (advisory
 * lock), §23 (audit inside tx).
 *
 * commitRosterImport runs ONE db.$transaction. These tests mock the tx client
 * and assert:
 *   - the exact pg_advisory_xact_lock raw SQL is issued (and is the ONLY raw SQL);
 *   - the org is re-queried in-tx and created when absent;
 *   - each `creates` respondent is created;
 *   - a backfill update sets ONLY externalId (never dedupeSource/dedupeValue);
 *   - exactly one auditLog.create row is written;
 *   - NO delete / deleteMany / updateMany is ever called;
 *   - a plan with blocks throws (rolls back — nothing committed).
 */

import { commitRosterImport } from "../../../../lib/assessments/esperto-import/commit";
import type { RosterImportPlan } from "../../../../lib/assessments/esperto-import/roster-plan";

const actor = { userId: "admin-1", email: "admin@example.com" };

interface MockTx {
  $executeRaw: jest.Mock;
  organization: { findFirst: jest.Mock; create: jest.Mock };
  orgRespondent: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    updateMany: jest.Mock;
  };
  auditLog: { create: jest.Mock };
}

function makeTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    organization: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "org-new", ...data }),
      ),
    },
    orgRespondent: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: "r-new", ...data }),
      ),
      update: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id }),
      ),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    ...overrides,
  };
}

/** A db stub whose $transaction simply invokes the callback with `tx`. */
function makeDb(tx: MockTx) {
  return {
    $transaction: jest.fn(async (cb: (t: MockTx) => Promise<unknown>) => cb(tx)),
  };
}

function basePlan(over: Partial<RosterImportPlan> = {}): RosterImportPlan {
  return {
    companyName: "Acme Corp",
    ownerCoachId: "coach-1",
    orgAction: "create",
    creates: [],
    backfills: [],
    skips: [],
    blocks: [],
    ...over,
  };
}

function newRespondent(memberid: string, email: string) {
  return {
    memberid,
    email,
    normalizedEmail: email.toLowerCase(),
    firstName: "Jane",
    lastName: "Doe",
    jobTitle: "CEO",
    roleType: "ceofounderwithteam",
    externalId: memberid,
    dedupeSource: "external" as const,
    dedupeValue: memberid,
  };
}

describe("commitRosterImport — advisory lock", () => {
  it("issues the pg_advisory_xact_lock as the only raw SQL, before any write", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    await commitRosterImport(db as never, basePlan(), actor);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    // The raw SQL goes in as a tagged-template (TemplateStringsArray) — the
    // first arg's joined text must mention the advisory lock.
    const firstArg = tx.$executeRaw.mock.calls[0][0];
    const sqlText = Array.isArray(firstArg) ? firstArg.join("?") : String(firstArg);
    expect(sqlText).toContain("pg_advisory_xact_lock");
    expect(sqlText).toContain("hashtext");
  });
});

describe("commitRosterImport — org reconciliation", () => {
  it("creates the org when the in-tx re-query finds none (orgAction=create)", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const res = await commitRosterImport(db as never, basePlan(), actor);
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(res.orgId).toBe("org-new");
    expect(res.orgAction).toBe("create");
  });

  it("reuses the matched org (orgAction=match) and does NOT create one", async () => {
    const tx = makeTx({
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: "org-1" }),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    const res = await commitRosterImport(
      db as never,
      basePlan({ orgAction: "match", orgId: "org-1" }),
      actor,
    );
    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(res.orgId).toBe("org-1");
  });

  it("throws (rolls back) when a match plan's org has vanished in-tx", async () => {
    const tx = makeTx({
      organization: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    await expect(
      commitRosterImport(
        db as never,
        basePlan({ orgAction: "match", orgId: "org-1" }),
        actor,
      ),
    ).rejects.toThrow();
    expect(tx.orgRespondent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("throws when a match plan resolves to a DIFFERENT org in-tx", async () => {
    const tx = makeTx({
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: "org-OTHER" }),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    await expect(
      commitRosterImport(
        db as never,
        basePlan({ orgAction: "match", orgId: "org-1" }),
        actor,
      ),
    ).rejects.toThrow();
  });

  it("throws when a create plan's org now EXISTS in-tx (concurrent insert won)", async () => {
    const tx = makeTx({
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: "org-raced" }),
        create: jest.fn(),
      },
    });
    const db = makeDb(tx);
    await expect(
      commitRosterImport(db as never, basePlan({ orgAction: "create" }), actor),
    ).rejects.toThrow();
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
});

describe("commitRosterImport — creates", () => {
  it("creates each planned respondent with the live dedupe shape", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      creates: [newRespondent("M1", "a@x.com"), newRespondent("M2", "b@x.com")],
    });
    const res = await commitRosterImport(db as never, plan, actor);

    expect(tx.orgRespondent.create).toHaveBeenCalledTimes(2);
    const firstData = tx.orgRespondent.create.mock.calls[0][0].data;
    expect(firstData.organizationId).toBe("org-new");
    expect(firstData.dedupeSource).toBe("external");
    expect(firstData.dedupeValue).toBe("M1");
    expect(firstData.externalId).toBe("M1");
    // The transient `memberid` field must NOT be written to the DB row.
    expect(firstData.memberid).toBeUndefined();
    expect(res.created).toBe(2);
  });

  it("skips a create when the row already exists in-tx (re-resolution)", async () => {
    // In-tx the org has gained the same external identity since preview.
    const tx = makeTx();
    tx.orgRespondent.findMany = jest
      .fn()
      .mockResolvedValue([
        { id: "r-existing", externalId: "M1", normalizedEmail: "a@x.com" },
      ]);
    const db = makeDb(tx);
    const plan = basePlan({
      orgAction: "match",
      orgId: "org-1",
      creates: [newRespondent("M1", "a@x.com")],
    });
    tx.organization.findFirst = jest.fn().mockResolvedValue({ id: "org-1" });
    const res = await commitRosterImport(db as never, plan, actor);
    expect(tx.orgRespondent.create).not.toHaveBeenCalled();
    expect(res.created).toBe(0);
  });
});

describe("commitRosterImport — backfill (null-only)", () => {
  it("updates ONLY externalId, never dedupeSource/dedupeValue", async () => {
    const tx = makeTx();
    // In-tx the email row still has a null externalId.
    tx.orgRespondent.findMany = jest
      .fn()
      .mockResolvedValue([
        { id: "r1", externalId: null, normalizedEmail: "jane@x.com" },
      ]);
    tx.organization.findFirst = jest.fn().mockResolvedValue({ id: "org-1" });
    const db = makeDb(tx);
    const plan = basePlan({
      orgAction: "match",
      orgId: "org-1",
      backfills: [{ id: "r1", externalId: "M1" }],
    });
    const res = await commitRosterImport(db as never, plan, actor);

    expect(tx.orgRespondent.update).toHaveBeenCalledTimes(1);
    const updateArgs = tx.orgRespondent.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe("r1");
    expect(updateArgs.data.externalId).toBe("M1");
    // MUST NOT touch the non-null identity fields.
    expect(updateArgs.data.dedupeSource).toBeUndefined();
    expect(updateArgs.data.dedupeValue).toBeUndefined();
    expect(res.backfilled).toBe(1);
  });

  it("does NOT backfill when the in-tx row already has a (matching) externalId", async () => {
    const tx = makeTx();
    tx.orgRespondent.findMany = jest
      .fn()
      .mockResolvedValue([
        { id: "r1", externalId: "M1", normalizedEmail: "jane@x.com" },
      ]);
    tx.organization.findFirst = jest.fn().mockResolvedValue({ id: "org-1" });
    const db = makeDb(tx);
    const plan = basePlan({
      orgAction: "match",
      orgId: "org-1",
      backfills: [{ id: "r1", externalId: "M1" }],
    });
    const res = await commitRosterImport(db as never, plan, actor);
    expect(tx.orgRespondent.update).not.toHaveBeenCalled();
    expect(res.backfilled).toBe(0);
  });

  it("throws when the in-tx row gained a CONFLICTING externalId since preview", async () => {
    const tx = makeTx();
    tx.orgRespondent.findMany = jest
      .fn()
      .mockResolvedValue([
        { id: "r1", externalId: "OTHER", normalizedEmail: "jane@x.com" },
      ]);
    tx.organization.findFirst = jest.fn().mockResolvedValue({ id: "org-1" });
    const db = makeDb(tx);
    const plan = basePlan({
      orgAction: "match",
      orgId: "org-1",
      backfills: [{ id: "r1", externalId: "M1" }],
    });
    await expect(
      commitRosterImport(db as never, plan, actor),
    ).rejects.toThrow();
  });
});

describe("commitRosterImport — audit + safety", () => {
  it("writes exactly one EspertoRosterImport audit row inside the tx", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      creates: [newRespondent("M1", "a@x.com")],
      skips: [{ memberid: "T1", reason: "testuser" }],
    });
    await commitRosterImport(db as never, plan, actor);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArgs = tx.auditLog.create.mock.calls[0][0].data;
    expect(auditArgs.entityType).toBe("EspertoRosterImport");
    expect(auditArgs.action).toBe("IMPORT");
    expect(auditArgs.performedBy).toBe("admin@example.com");
    expect(auditArgs.entityId).toBe("org-new");
    const changes = JSON.parse(auditArgs.changes);
    expect(changes.created).toBe(1);
    expect(changes.skipped).toBe(1);
    expect(changes.source).toBe("esperto-members");
  });

  it("NEVER calls delete / deleteMany / updateMany", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      creates: [newRespondent("M1", "a@x.com")],
      backfills: [],
    });
    await commitRosterImport(db as never, plan, actor);
    expect(tx.orgRespondent.delete).not.toHaveBeenCalled();
    expect(tx.orgRespondent.deleteMany).not.toHaveBeenCalled();
    expect(tx.orgRespondent.updateMany).not.toHaveBeenCalled();
  });

  it("throws BEFORE any write when the plan carries blocks", async () => {
    const tx = makeTx();
    const db = makeDb(tx);
    const plan = basePlan({
      blocks: [{ memberid: "M1", reason: "resolver-split" }],
      creates: [newRespondent("M2", "b@x.com")],
    });
    await expect(
      commitRosterImport(db as never, plan, actor),
    ).rejects.toThrow();
    expect(tx.orgRespondent.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
