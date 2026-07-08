/**
 * Wave Y — import-health summarizer + cron-isolation guard.
 *
 * Summarizer: shows the cron's ACTUAL checkpoint decisions (no re-evaluation);
 * uncapped totals via count(), parsed breakdowns capped with a `truncated` flag;
 * cron-health three-state (disabled / healthy / stale) with the 30-min threshold
 * and flag-off neutrality; defensive against malformed rows.
 *
 * Isolation: the Wave V alert sweep must NEVER select assessment_import_activity
 * rows — its span query is entityType:"assessment_import"-scoped (spec 19y D5).
 */
import {
  buildImportHealthSummary,
  type ImportHealthDb,
} from "@/lib/assessments/esperto-import/import-health";
import {
  ALERT_SIGNAL_ENTITY_TYPE,
  COMMIT_RESULT_ACTION,
  COMMIT_CONFLICT_ACTION,
  ALERT_CRON_ENTITY_TYPE,
  ALERT_CRON_RUN_ACTION,
  runImportAlertSweep,
} from "@/lib/assessments/esperto-import/alert-signals";
import { ACTIVITY_ENTITY_TYPE, PREVIEW_RESULT_ACTION, REFUSED_ACTION } from "@/lib/assessments/esperto-import/import-activity-signals";

const FLAG = "WAVE_V_IMPORT_ALERTING_ENABLED";
const KILL = "WAVE_V_IMPORT_ALERTING_KILL";
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = { [FLAG]: process.env[FLAG], [KILL]: process.env[KILL] };
  delete process.env[KILL];
  process.env[FLAG] = "1";
});
afterEach(() => {
  for (const k of [FLAG, KILL]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const NOW = new Date("2026-07-07T20:00:00.000Z");
type Row = { entityType: string; action: string; entityId: string; changes: string; timestamp: Date };
function row(entityType: string, action: string, changes: object, minsAgo: number, entityId = "org-1"): Row {
  return { entityType, action, entityId, changes: JSON.stringify(changes), timestamp: new Date(NOW.getTime() - minsAgo * 60000) };
}

function matchWhere(r: Row, where: Record<string, unknown>): boolean {
  const et = where.entityType as string | { in: string[] } | undefined;
  if (typeof et === "string" && r.entityType !== et) return false;
  if (et && typeof et === "object" && !et.in.includes(r.entityType)) return false;
  if (where.action && r.action !== where.action) return false;
  const ts = where.timestamp as { gte?: Date; gt?: Date; lte?: Date } | undefined;
  if (ts) {
    const t = r.timestamp.getTime();
    if (ts.gte && t < ts.gte.getTime()) return false;
    if (ts.gt && t <= ts.gt.getTime()) return false;
    if (ts.lte && t > ts.lte.getTime()) return false;
  }
  return true;
}
function fakeDb(rows: Row[]): ImportHealthDb {
  return {
    auditLog: {
      count: async ({ where }) => rows.filter((r) => matchWhere(r, where as Record<string, unknown>)).length,
      findMany: async ({ where, orderBy, take }) => {
        const out = rows
          .filter((r) => matchWhere(r, where as Record<string, unknown>))
          .sort((a, b) => (orderBy.timestamp === "desc" ? b.timestamp.getTime() - a.timestamp.getTime() : a.timestamp.getTime() - b.timestamp.getTime()));
        return out.slice(0, take);
      },
    },
  };
}

describe("buildImportHealthSummary — cron health", () => {
  it("flag OFF → 'disabled' even with a stale/absent checkpoint", async () => {
    process.env[FLAG] = "0";
    const s = await buildImportHealthSummary({ db: fakeDb([]), now: NOW });
    expect(s.cron.health).toBe("disabled");
    expect(s.alerting.enabled).toBe(false);
  });

  it("flag ON + checkpoint 5 min ago → 'healthy'", async () => {
    const rows = [row(ALERT_CRON_ENTITY_TYPE, ALERT_CRON_RUN_ACTION, { processedThrough: NOW.toISOString(), evaluated: 3, fired: [] }, 5)];
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    expect(s.cron.health).toBe("healthy");
    expect(s.cron.staleMinutes).toBe(5);
    expect(s.cron.lastSweptAt).not.toBeNull();
  });

  it("flag ON + checkpoint 40 min ago → 'stale'", async () => {
    const rows = [row(ALERT_CRON_ENTITY_TYPE, ALERT_CRON_RUN_ACTION, { fired: [] }, 40)];
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    expect(s.cron.health).toBe("stale");
  });

  it("flag ON + no checkpoint ever → 'stale'", async () => {
    const s = await buildImportHealthSummary({ db: fakeDb([]), now: NOW });
    expect(s.cron.health).toBe("stale");
    expect(s.cron.lastSweptAt).toBeNull();
  });
});

describe("buildImportHealthSummary — totals, breakdowns, history, recent", () => {
  const rows: Row[] = [
    row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_RESULT_ACTION, { outcome: "created", latencyMs: 1200 }, 10),
    row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_RESULT_ACTION, { outcome: "reused-noop", latencyMs: 800 }, 20),
    row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_CONFLICT_ACTION, { errorCode: "divergent-reimport" }, 30),
    row(ACTIVITY_ENTITY_TYPE, REFUSED_ACTION, { code: "entitlement-denied", mode: "commit" }, 15),
    row(ACTIVITY_ENTITY_TYPE, REFUSED_ACTION, { code: "org-access", mode: "preview" }, 25, "unknown"),
    row(ACTIVITY_ENTITY_TYPE, PREVIEW_RESULT_ACTION, { blockReasons: ["multiple-cids"], skipReasonCounts: {} }, 12),
    // Older than 24h (in 7d, out of 24h):
    row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_RESULT_ACTION, { outcome: "created", latencyMs: 500 }, 60 * 48),
    row(ALERT_CRON_ENTITY_TYPE, ALERT_CRON_RUN_ACTION, { fired: ["divergent-reimport"], evaluated: 4, processedThrough: NOW.toISOString() }, 8),
    row(ALERT_CRON_ENTITY_TYPE, ALERT_CRON_RUN_ACTION, { fired: ["divergent-reimport", "latency-p95"], evaluated: 2 }, 60 * 30 /* 30h ago: in 7d, out of 24h */),
  ];

  it("uncapped totals split 24h vs 7d", async () => {
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    expect(s.volume.last24h.commitResults).toBe(2); // the 48h-old one excluded
    expect(s.volume.last7d.commitResults).toBe(3);
    expect(s.volume.last24h.commitConflicts).toBe(1);
    expect(s.volume.last24h.refusals).toBe(2);
    expect(s.volume.last24h.previewDegraded).toBe(1);
  });

  it("parsed breakdowns + reference p95 (not truncated at this volume)", async () => {
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    expect(s.volume.last24h.commitResultsByOutcome).toEqual({ created: 1, "reused-noop": 1 });
    expect(s.volume.last24h.commitConflictsByCode).toEqual({ "divergent-reimport": 1 });
    expect(s.volume.last24h.refusalsByCode).toEqual({ "entitlement-denied": 1, "org-access": 1 });
    expect(s.volume.last24h.latencyP95Ms).toBe(1200);
    expect(s.volume.last24h.truncated).toBe(false);
  });

  it("firing history = per-code counts + most-recent time (the cron's real decisions)", async () => {
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    const div7d = s.history.last7d.find((f) => f.code === "divergent-reimport");
    expect(div7d?.count).toBe(2); // fired in both checkpoint rows
    const div24h = s.history.last24h.find((f) => f.code === "divergent-reimport");
    expect(div24h?.count).toBe(1); // only the 8-min-ago checkpoint is within 24h
    expect(s.history.last7d.find((f) => f.code === "latency-p95")?.count).toBe(1);
  });

  it("recent is time-desc across both entityTypes with parsed code/outcome", async () => {
    const s = await buildImportHealthSummary({ db: fakeDb(rows), now: NOW });
    expect(s.recent.length).toBeGreaterThan(0);
    for (let i = 1; i < s.recent.length; i++) {
      expect(new Date(s.recent[i - 1].at).getTime()).toBeGreaterThanOrEqual(new Date(s.recent[i].at).getTime());
    }
    const refused = s.recent.find((r) => r.action === REFUSED_ACTION);
    expect(refused?.code).toBeTruthy();
    const result = s.recent.find((r) => r.action === COMMIT_RESULT_ACTION);
    expect(result?.outcome).toBeTruthy();
  });

  it("is defensive against a malformed changes row", async () => {
    const bad: Row = { entityType: ALERT_SIGNAL_ENTITY_TYPE, action: COMMIT_RESULT_ACTION, entityId: "o", changes: "{not json", timestamp: new Date(NOW.getTime() - 60000) };
    const s = await buildImportHealthSummary({ db: fakeDb([bad]), now: NOW });
    expect(s.volume.last24h.commitResults).toBe(1); // count() still sees it
    expect(s.volume.last24h.commitResultsByOutcome).toEqual({}); // unparseable → no outcome bumped
  });
});

describe("buildImportHealthSummary — truncation honesty (D15)", () => {
  it("sets truncated=true when the parsed fetch hits the cap within the window", async () => {
    const many: Row[] = Array.from({ length: 2001 }, (_, i) =>
      row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_RESULT_ACTION, { outcome: "created", latencyMs: 100 }, i % 60),
    );
    const s = await buildImportHealthSummary({ db: fakeDb(many), now: NOW });
    expect(s.volume.last7d.truncated).toBe(true);
    expect(s.volume.last24h.truncated).toBe(true); // all 2001 fall inside 24h
    expect(s.volume.last7d.commitResults).toBe(2001); // total is still uncapped (count)
  });

  it("does NOT falsely flag the 24h window when the >2000 rows span 7d but few are recent (LOW-2)", async () => {
    // 2001 rows evenly spread across ~5 days → the newest-2000 fetch drops the
    // oldest, but its oldest KEPT row is still days old, so the 24h subset is
    // complete and must NOT be flagged truncated.
    const spanMin = 5 * 24 * 60;
    const many: Row[] = Array.from({ length: 2001 }, (_, i) =>
      row(ALERT_SIGNAL_ENTITY_TYPE, COMMIT_RESULT_ACTION, { outcome: "created", latencyMs: 100 }, Math.round((i * spanMin) / 2001)),
    );
    const s = await buildImportHealthSummary({ db: fakeDb(many), now: NOW });
    expect(s.volume.last7d.truncated).toBe(true); // the cap genuinely drops 7d rows
    expect(s.volume.last24h.truncated).toBe(false); // but the 24h view is complete
  });
});

describe("cron isolation (D5) — the sweep never selects activity rows", () => {
  it("runImportAlertSweep's span query is scoped to entityType:assessment_import", async () => {
    const findManyWheres: Record<string, unknown>[] = [];
    const sweepDb = {
      auditLog: {
        findFirst: async () => null, // no checkpoint → bootstrap span
        findMany: async (args: { where: Record<string, unknown> }) => {
          findManyWheres.push(args.where);
          return []; // rows irrelevant — we assert the WHERE
        },
        create: async () => ({ id: "cp" }),
      },
    };
    await runImportAlertSweep({
      db: sweepDb as never,
      now: NOW,
      sendEmail: async () => {},
    });
    // The sweep's span query must target the Wave V entityType, never the Wave Y one.
    const spanQuery = findManyWheres.find((w) => w.timestamp);
    expect(spanQuery?.entityType).toBe(ALERT_SIGNAL_ENTITY_TYPE);
    expect(spanQuery?.entityType).not.toBe(ACTIVITY_ENTITY_TYPE);
    for (const w of findManyWheres) {
      expect(w.entityType).not.toBe(ACTIVITY_ENTITY_TYPE);
    }
  });
});
