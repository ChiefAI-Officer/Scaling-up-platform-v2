/**
 * Wave Y — durable import-ACTIVITY signals (preview + refusal), panel-only.
 *
 * Isolation: OWN entityType `assessment_import_activity` (never the alert cron's
 * `assessment_import`). Durability: UNCONDITIONAL (no flag read) + fail-soft.
 * PII-safe payloads (codes/counts only). Org-access refusal records
 * entityId:"unknown" — never the untrusted requested org id (Codex C4).
 */
import {
  ACTIVITY_ENTITY_TYPE,
  PREVIEW_RESULT_ACTION,
  REFUSED_ACTION,
  recordPreviewSignal,
  recordRefusalSignal,
} from "@/lib/assessments/esperto-import/import-activity-signals";

const ALERTING_FLAG = "WAVE_V_IMPORT_ALERTING_ENABLED";
let savedFlag: string | undefined;

beforeEach(() => {
  savedFlag = process.env[ALERTING_FLAG];
  delete process.env[ALERTING_FLAG]; // prove writes do NOT depend on the alerting flag
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env[ALERTING_FLAG];
  else process.env[ALERTING_FLAG] = savedFlag;
});

function writerDb() {
  const create = jest.fn().mockResolvedValue({ id: "row-1" });
  return { db: { auditLog: { create } }, create };
}

function lastRow(create: jest.Mock) {
  return create.mock.calls[create.mock.calls.length - 1][0].data as {
    entityType: string;
    entityId: string;
    action: string;
    performedBy: string;
    changes: string;
  };
}

describe("recordPreviewSignal", () => {
  it("writes a preview_result row under the activity entityType with counts", async () => {
    const { db, create } = writerDb();
    await recordPreviewSignal(db, {
      organizationId: "org-1",
      templateAlias: "leadership-vision-alignment",
      blockReasons: ["multiple-cids"],
      skipReasonCounts: { "unresolved-respondent": 2 },
      filesInBatch: 5,
      respondentsSkipped: 2,
    });
    const row = lastRow(create);
    expect(row.entityType).toBe(ACTIVITY_ENTITY_TYPE);
    expect(row.entityType).not.toBe("assessment_import"); // NOT the cron's entityType
    expect(row.entityId).toBe("org-1");
    expect(row.action).toBe(PREVIEW_RESULT_ACTION);
    expect(row.performedBy).toBe("SYSTEM");
    const changes = JSON.parse(row.changes);
    expect(changes).toEqual({
      organizationId: "org-1",
      templateAlias: "leadership-vision-alignment",
      blockReasons: ["multiple-cids"],
      skipReasonCounts: { "unresolved-respondent": 2 },
      filesInBatch: 5,
      respondentsSkipped: 2,
    });
  });

  it("writes UNCONDITIONALLY — no read of the alerting flag", async () => {
    const { db, create } = writerDb();
    expect(process.env[ALERTING_FLAG]).toBeUndefined();
    await recordPreviewSignal(db, {
      organizationId: "org-1",
      templateAlias: "a",
      blockReasons: [],
      skipReasonCounts: { "incomplete-respondent": 1 },
      filesInBatch: 1,
      respondentsSkipped: 1,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("is fail-soft — a create rejection never throws", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordPreviewSignal(
        { auditLog: { create } },
        {
          organizationId: "org-1",
          templateAlias: "a",
          blockReasons: ["empty-batch"],
          skipReasonCounts: {},
          filesInBatch: 0,
          respondentsSkipped: 0,
        },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("recordRefusalSignal", () => {
  it("post-access refusal records the validated org id", async () => {
    const { db, create } = writerDb();
    await recordRefusalSignal(db, {
      code: "entitlement-denied",
      mode: "commit",
      organizationId: "org-7",
      templateAlias: "RockHabits",
    });
    const row = lastRow(create);
    expect(row.entityType).toBe(ACTIVITY_ENTITY_TYPE);
    expect(row.action).toBe(REFUSED_ACTION);
    expect(row.entityId).toBe("org-7");
    expect(JSON.parse(row.changes)).toEqual({
      code: "entitlement-denied",
      mode: "commit",
      organizationId: "org-7",
      templateAlias: "RockHabits",
    });
  });

  it("org-access refusal records entityId:'unknown' and NEVER the requested org id", async () => {
    const { db, create } = writerDb();
    await recordRefusalSignal(db, {
      code: "org-access",
      mode: "preview",
      // organizationId intentionally omitted (untrusted requested id, Codex C4)
      templateAlias: "leadership-vision-alignment",
    });
    const row = lastRow(create);
    expect(row.entityId).toBe("unknown");
    const changes = JSON.parse(row.changes);
    expect(changes.organizationId).toBeUndefined(); // undefined-stripped, never persisted
    expect(changes.code).toBe("org-access");
    expect(changes.mode).toBe("preview");
  });

  it("is fail-soft — a create rejection never throws", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordRefusalSignal(
        { auditLog: { create } },
        { code: "too-many-files", mode: "commit", organizationId: "org-1" },
      ),
    ).resolves.toBeUndefined();
  });
});
