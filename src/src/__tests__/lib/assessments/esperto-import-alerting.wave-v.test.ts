/**
 * Wave V (V-2) — in-app import alerting.
 *
 * Signal writers: AuditLog rows persisted UNCONDITIONALLY (Wave Q rule) from
 * the same route points that emit the console markers; fail-soft (a write
 * failure never breaks an import response); PII-safe payloads.
 *
 * Sweep (cron body): persisted cursor on an AuditLog checkpoint row —
 * checkpoint written BEFORE send (retry-safe dedup anchor; a late tick or
 * deploy pause can't silently drop a span, an Inngest retry can't
 * double-email). Implements runbook 18o §7 A (divergent-reimport — always
 * page), B (denial burst >3), C (commit latency p95 >10s), plus
 * unexpected-error (D4). ADMIN_EMAIL REQUIRED — no silent fallback.
 */
import fs from "fs";
import path from "path";
import {
  ALERT_SIGNAL_ENTITY_TYPE,
  ALERT_CRON_ENTITY_TYPE,
  COMMIT_RESULT_ACTION,
  COMMIT_CONFLICT_ACTION,
  recordCommitResultSignal,
  recordCommitConflictSignal,
  runImportAlertSweep,
} from "@/lib/assessments/esperto-import/alert-signals";

const ENABLED = "WAVE_V_IMPORT_ALERTING_ENABLED";
const KILL = "WAVE_V_IMPORT_ALERTING_KILL";
const ADMIN = "ADMIN_EMAIL";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of [ENABLED, KILL, ADMIN]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env[ENABLED] = "1";
  process.env[ADMIN] = "alerts@scalingup.example";
});
afterEach(() => {
  for (const k of [ENABLED, KILL, ADMIN]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Signal writers ───────────────────────────────────────────────────────

describe("signal writers", () => {
  function writerDb() {
    const create = jest.fn().mockResolvedValue({ id: "row-1" });
    return { db: { auditLog: { create } }, create };
  }

  it("commit_result row carries latencyMs + outcome under the signal entityType", async () => {
    const { db, create } = writerDb();
    await recordCommitResultSignal(db, {
      organizationId: "org-1",
      templateAlias: "scaling-up-full",
      outcome: "created",
      submissionsCreated: 12,
      latencyMs: 4321,
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.entityType).toBe(ALERT_SIGNAL_ENTITY_TYPE);
    expect(args.data.action).toBe(COMMIT_RESULT_ACTION);
    expect(args.data.entityId).toBe("org-1");
    expect(args.data.performedBy).toBe("SYSTEM");
    const changes = JSON.parse(args.data.changes);
    expect(changes.latencyMs).toBe(4321);
    expect(changes.outcome).toBe("created");
  });

  it("commit_conflict row carries the errorCode", async () => {
    const { db, create } = writerDb();
    await recordCommitConflictSignal(db, {
      errorCode: "divergent-reimport",
      organizationId: "org-1",
      templateAlias: "scaling-up-full",
    });
    const changes = JSON.parse(create.mock.calls[0][0].data.changes);
    expect(changes.errorCode).toBe("divergent-reimport");
    expect(create.mock.calls[0][0].data.action).toBe(COMMIT_CONFLICT_ACTION);
  });

  it("fail-soft: a write failure never throws", async () => {
    const db = { auditLog: { create: jest.fn().mockRejectedValue(new Error("db down")) } };
    await expect(
      recordCommitConflictSignal(db, {
        errorCode: "plan-blocked",
        organizationId: "org-1",
        templateAlias: "scaling-up-full",
      }),
    ).resolves.toBeUndefined();
  });

  it("undefined fields are dropped (marker-parity), never serialized", async () => {
    const { db, create } = writerDb();
    await recordCommitResultSignal(db, {
      organizationId: "org-1",
      templateAlias: "scaling-up-full",
      outcome: "reused-noop",
      submissionsCreated: undefined,
      latencyMs: 10,
    });
    const changes = JSON.parse(create.mock.calls[0][0].data.changes);
    expect("submissionsCreated" in changes).toBe(false);
  });
});

// ── Sweep ────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-06T12:00:00Z");
const TEN_MIN_AGO = new Date(NOW.getTime() - 10 * 60 * 1000);

function signalRow(
  action: string,
  changes: Record<string, unknown>,
  minutesAgo: number,
) {
  return {
    id: `sig-${Math.abs(minutesAgo)}-${action}-${JSON.stringify(changes).length}`,
    entityType: ALERT_SIGNAL_ENTITY_TYPE,
    action,
    changes: JSON.stringify(changes),
    timestamp: new Date(NOW.getTime() - minutesAgo * 60 * 1000),
  };
}

const conflict = (errorCode: string, minutesAgo: number) =>
  signalRow(COMMIT_CONFLICT_ACTION, { errorCode, organizationId: "org-1" }, minutesAgo);
const result = (latencyMs: number, minutesAgo: number) =>
  signalRow(COMMIT_RESULT_ACTION, { latencyMs, outcome: "created" }, minutesAgo);

function sweepDb(opts: {
  checkpoint?: { processedThrough: string } | null;
  signals?: unknown[];
}) {
  const calls: string[] = [];
  const findFirst = jest.fn().mockImplementation(async () => {
    calls.push("read-checkpoint");
    return opts.checkpoint === null || opts.checkpoint === undefined
      ? null
      : {
          id: "ckpt-1",
          entityType: ALERT_CRON_ENTITY_TYPE,
          action: "run",
          changes: JSON.stringify(opts.checkpoint),
          timestamp: new Date("2026-07-06T11:50:00Z"),
        };
  });
  const findMany = jest.fn().mockImplementation(async () => {
    calls.push("read-signals");
    return opts.signals ?? [];
  });
  const create = jest.fn().mockImplementation(async () => {
    calls.push("write-checkpoint");
    return { id: "ckpt-2" };
  });
  const sendEmail = jest.fn().mockImplementation(async () => {
    calls.push("send-email");
  });
  return { db: { auditLog: { findFirst, findMany, create } }, findMany, create, sendEmail, calls };
}

describe("runImportAlertSweep", () => {
  it("flag off → skipped, zero db calls", async () => {
    delete process.env[ENABLED];
    const h = sweepDb({});
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.skipped).toBe("flag-off");
    expect(h.calls).toEqual([]);
  });

  it("KILL beats ENABLED", async () => {
    process.env[KILL] = "1";
    const h = sweepDb({});
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.skipped).toBe("flag-off");
  });

  it("bootstrap (no checkpoint): span starts 10 minutes back", async () => {
    const h = sweepDb({ checkpoint: null });
    await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    const where = h.findMany.mock.calls[0][0].where;
    expect(where.timestamp.gt).toEqual(TEN_MIN_AGO);
    expect(where.timestamp.lte).toEqual(NOW);
    expect(where.entityType).toBe(ALERT_SIGNAL_ENTITY_TYPE);
  });

  it("cursor: span starts at the checkpoint's processedThrough (late ticks lose nothing)", async () => {
    const t = "2026-07-06T11:37:00.000Z";
    const h = sweepDb({ checkpoint: { processedThrough: t } });
    await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(h.findMany.mock.calls[0][0].where.timestamp.gt).toEqual(new Date(t));
  });

  it("empty span → checkpoint still advances, no email", async () => {
    const h = sweepDb({ checkpoint: null, signals: [] });
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(h.create).toHaveBeenCalledTimes(1);
    const changes = JSON.parse(h.create.mock.calls[0][0].data.changes);
    expect(changes.processedThrough).toBe(NOW.toISOString());
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(out.fired).toEqual([]);
  });

  it("A: one divergent-reimport fires and emails ADMIN_EMAIL", async () => {
    const h = sweepDb({ checkpoint: null, signals: [conflict("divergent-reimport", 3)] });
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.fired).toContain("divergent-reimport");
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail.mock.calls[0][0].to).toBe("alerts@scalingup.example");
    expect(h.sendEmail.mock.calls[0][0].subject).toMatch(/import alert/i);
  });

  it("unexpected-error fires (D4 — the most alertable class)", async () => {
    const h = sweepDb({ checkpoint: null, signals: [conflict("unexpected-error", 2)] });
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.fired).toContain("unexpected-error");
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("B: 4 denial-class conflicts fire; 3 do not", async () => {
    const denials = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        conflict(
          ["entitlement-denied", "cid-mismatch", "low-resolution-batch"][i % 3],
          i + 1,
        ),
      );
    const h4 = sweepDb({ checkpoint: null, signals: denials(4) });
    const out4 = await runImportAlertSweep({ db: h4.db, now: NOW, sendEmail: h4.sendEmail });
    expect(out4.fired).toContain("denial-burst");

    const h3 = sweepDb({ checkpoint: null, signals: denials(3) });
    const out3 = await runImportAlertSweep({ db: h3.db, now: NOW, sendEmail: h3.sendEmail });
    expect(out3.fired).not.toContain("denial-burst");
    expect(h3.sendEmail).not.toHaveBeenCalled();
  });

  it("C: latency p95 > 10s fires; under does not", async () => {
    // 20 results: p95 index = ceil(0.95*20)-1 = 18 (0-based) → 19th value.
    const slow = Array.from({ length: 20 }, (_, i) => result(i < 19 ? 1000 : 12000, i % 9 + 1));
    // p95 of [1000×19, 12000] → sorted idx 18 = 1000 → NOT fired.
    const hUnder = sweepDb({ checkpoint: null, signals: slow });
    const outUnder = await runImportAlertSweep({
      db: hUnder.db,
      now: NOW,
      sendEmail: hUnder.sendEmail,
    });
    expect(outUnder.fired).not.toContain("latency-p95");

    const reallySlow = Array.from({ length: 20 }, (_, i) =>
      result(i < 10 ? 1000 : 12000, (i % 9) + 1),
    );
    const hOver = sweepDb({ checkpoint: null, signals: reallySlow });
    const outOver = await runImportAlertSweep({
      db: hOver.db,
      now: NOW,
      sendEmail: hOver.sendEmail,
    });
    expect(outOver.fired).toContain("latency-p95");
  });

  it("checkpoint (with what fired) is written BEFORE the email is sent", async () => {
    const h = sweepDb({ checkpoint: null, signals: [conflict("divergent-reimport", 1)] });
    await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(h.calls.indexOf("write-checkpoint")).toBeLessThan(h.calls.indexOf("send-email"));
    const changes = JSON.parse(h.create.mock.calls[0][0].data.changes);
    expect(changes.fired).toContain("divergent-reimport");
  });

  it("one consolidated email when multiple conditions fire in the same span", async () => {
    const signals = [
      conflict("divergent-reimport", 1),
      ...Array.from({ length: 4 }, (_, i) => conflict("entitlement-denied", i + 2)),
    ];
    const h = sweepDb({ checkpoint: null, signals });
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.fired).toEqual(expect.arrayContaining(["divergent-reimport", "denial-burst"]));
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const text = h.sendEmail.mock.calls[0][0].text as string;
    expect(text).toMatch(/divergent-reimport/);
    expect(text).toMatch(/denial/i);
  });

  it("missing ADMIN_EMAIL: no send, no throw, emailed=false (loud, no silent fallback)", async () => {
    delete process.env[ADMIN];
    const h = sweepDb({ checkpoint: null, signals: [conflict("divergent-reimport", 1)] });
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(out.emailed).toBe(false);
    expect(out.error).toBe("missing-admin-email");
  });

  it("a send failure is swallowed (checkpoint already recorded the firing)", async () => {
    const h = sweepDb({ checkpoint: null, signals: [conflict("divergent-reimport", 1)] });
    h.sendEmail.mockRejectedValue(new Error("smtp down"));
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(out.emailed).toBe(false);
    expect(out.error).toBe("send-failed");
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("a checkpoint-write failure suppresses the send (a retry would double-email)", async () => {
    const h = sweepDb({ checkpoint: null, signals: [conflict("divergent-reimport", 1)] });
    h.create.mockRejectedValue(new Error("db down"));
    const out = await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(out.emailed).toBe(false);
    expect(out.error).toBe("checkpoint-failed");
  });

  it("email content is PII-free: codes + counts + span only", async () => {
    const h = sweepDb({
      checkpoint: null,
      signals: [conflict("divergent-reimport", 1)],
    });
    await runImportAlertSweep({ db: h.db, now: NOW, sendEmail: h.sendEmail });
    const { text, html } = h.sendEmail.mock.calls[0][0] as { text: string; html: string };
    for (const body of [text, html]) {
      expect(body).not.toMatch(/@(?!scalingup)/); // no respondent emails
      expect(body).toMatch(/divergent-reimport/);
    }
  });
});

// ── Route wiring guard ───────────────────────────────────────────────────

describe("route wiring guard (both import routes persist signals)", () => {
  const routes = [
    "src/app/api/assessments/import/route.ts",
    "src/app/api/admin/assessments/import/route.ts",
  ];

  it.each(routes)("%s calls both signal writers", (rel) => {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(src).toContain("recordCommitResultSignal(");
    expect(src).toContain("recordCommitConflictSignal(");
    // unexpected-error coverage: the catch-all writes a conflict signal too
    expect(src).toContain("unexpected-error");
  });
});
