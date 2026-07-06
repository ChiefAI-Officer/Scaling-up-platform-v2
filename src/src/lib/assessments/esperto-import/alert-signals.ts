/**
 * Wave V (V-2) — in-app import alerting: persisted signals + the alert sweep.
 *
 * Runbook `18o-ops-runbook.md` §7 defines four alert conditions over the
 * `assessment.esperto_import.*` markers. Those markers are console-only —
 * launch observability was human-read `vercel logs`. This module makes the
 * commit-path signal DURABLE (AuditLog rows, written UNCONDITIONALLY from the
 * same route points that emit the markers — Wave Q rule: flags gate
 * capability, never persisted data) and implements the sweep the Inngest
 * cron runs every 10 minutes:
 *
 *   A  — any `divergent-reimport` conflict            → always alert
 *   A2 — any `unexpected-error` commit failure (D4)   → always alert
 *   B  — >3 denial-class conflicts in the span        → alert
 *   C  — commit latency p95 > 10s over the span       → alert
 *   D  — flag-drift: NOT implementable in-app (the route 404s before any
 *        row exists) — log-drain-only, documented in the runbook addendum.
 *
 * Cursor design (spec 19v D5, Codex C1): each run reads the latest
 * checkpoint row, evaluates signals in `(processedThrough, now]`, and writes
 * the NEW checkpoint (recording what fired) BEFORE sending — so late ticks
 * and deploy pauses can't silently drop a span, and an Inngest retry after a
 * successful send can't double-email (the retry sees the advanced cursor).
 * First run ever bootstraps from `now - 10min`.
 *
 * PII CONTRACT (same as the markers): rows and emails carry ONLY
 * organizationId, templateAlias, counts, error codes, latencies, ISO span
 * bounds. NEVER raw mid/reportid/cid/email/name.
 */
import { isImportAlertingEnabled } from "@/lib/assessments/wave-v-flags";

// ── Row constants ────────────────────────────────────────────────────────

/** Signal rows written by the import routes. */
export const ALERT_SIGNAL_ENTITY_TYPE = "assessment_import";
export const COMMIT_RESULT_ACTION = "import_commit_result";
export const COMMIT_CONFLICT_ACTION = "import_commit_conflict";

/** Cron checkpoint rows (the persisted cursor). */
export const ALERT_CRON_ENTITY_TYPE = "assessment_import_alert_cron";
export const ALERT_CRON_RUN_ACTION = "run";
const ALERT_CRON_SINGLETON_ID = "singleton";

/** §7 B — denial-class conflict codes (burst threshold >3 per span). */
const DENIAL_CODES = new Set([
  "entitlement-denied",
  "cid-mismatch",
  "low-resolution-batch",
]);
const DENIAL_BURST_THRESHOLD = 3; // strictly-greater fires
const LATENCY_P95_THRESHOLD_MS = 10_000;
const BOOTSTRAP_SPAN_MS = 10 * 60 * 1000;
/** Backstop for a long catch-up span after a kill period — spans are tiny in practice. */
const MAX_SIGNALS_PER_SWEEP = 1000;

// ── Narrow DB shapes ─────────────────────────────────────────────────────

interface AuditLogCreate {
  create: (args: {
    data: {
      entityType: string;
      entityId: string;
      action: string;
      performedBy: string;
      changes: string;
    };
  }) => Promise<unknown>;
}

export interface AlertSignalDb {
  auditLog: AuditLogCreate;
}

interface AuditLogRow {
  id: string;
  action: string;
  changes: string;
  timestamp: Date;
}

export interface AlertSweepDb {
  auditLog: AuditLogCreate & {
    findFirst: (args: {
      where: { entityType: string; action: string };
      orderBy: { timestamp: "desc" };
    }) => Promise<AuditLogRow | null>;
    findMany: (args: {
      where: { entityType: string; timestamp: { gt: Date; lte: Date } };
      orderBy: { timestamp: "asc" };
      take: number;
    }) => Promise<AuditLogRow[]>;
  };
}

// ── Signal writers (called by BOTH import routes) ────────────────────────

function serializeFields(fields: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[key] = value;
  }
  return JSON.stringify(safe);
}

async function writeSignal(
  db: AlertSignalDb,
  action: string,
  organizationId: string | undefined,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        entityType: ALERT_SIGNAL_ENTITY_TYPE,
        entityId: organizationId ?? "unknown",
        action,
        performedBy: "SYSTEM",
        changes: serializeFields(fields),
      },
    });
  } catch {
    // Fail-soft — a signal-write failure must never break an import response
    // (mirrors emitEspertoImportMetric's never-throws contract).
  }
}

/** Persist the commit_result signal (same fields as the console marker). */
export async function recordCommitResultSignal(
  db: AlertSignalDb,
  fields: {
    organizationId: string;
    templateAlias: string;
    outcome: string;
    submissionsCreated?: number;
    latencyMs: number;
  },
): Promise<void> {
  await writeSignal(db, COMMIT_RESULT_ACTION, fields.organizationId, fields);
}

/** Persist a commit_conflict signal (RestrictedCommitError codes + `unexpected-error`). */
export async function recordCommitConflictSignal(
  db: AlertSignalDb,
  fields: {
    errorCode: string;
    organizationId: string;
    templateAlias: string;
  },
): Promise<void> {
  await writeSignal(db, COMMIT_CONFLICT_ACTION, fields.organizationId, fields);
}

// ── Sweep (the cron body — pure logic, injected deps) ────────────────────

export type AlertConditionCode =
  | "divergent-reimport"
  | "unexpected-error"
  | "denial-burst"
  | "latency-p95";

export interface AlertFiring {
  code: AlertConditionCode;
  /** Occurrence count backing the firing (conflicts counted / latencies measured). */
  count: number;
  detail: string;
}

export interface AlertSweepOutcome {
  skipped?: "flag-off";
  spanStart?: string;
  spanEnd?: string;
  evaluated?: number;
  fired: AlertConditionCode[];
  emailed: boolean;
  error?: "missing-admin-email" | "send-failed" | "checkpoint-failed";
}

interface ParsedSignal {
  action: string;
  errorCode?: string;
  latencyMs?: number;
}

function parseSignals(rows: AuditLogRow[]): ParsedSignal[] {
  const parsed: ParsedSignal[] = [];
  for (const row of rows) {
    if (row.action !== COMMIT_RESULT_ACTION && row.action !== COMMIT_CONFLICT_ACTION) {
      continue; // future signal kinds are ignored, never fatal
    }
    let changes: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(row.changes);
      if (raw && typeof raw === "object") changes = raw as Record<string, unknown>;
    } catch {
      // Malformed row — skip, never throw (runtime-lenient).
    }
    parsed.push({
      action: row.action,
      errorCode: typeof changes.errorCode === "string" ? changes.errorCode : undefined,
      latencyMs: typeof changes.latencyMs === "number" ? changes.latencyMs : undefined,
    });
  }
  return parsed;
}

/** p95 by the nearest-rank method: sorted[ceil(0.95·n) - 1]. */
function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

/** Pure §7 A/A2/B/C evaluation over one span's parsed signals. */
export function evaluateAlertConditions(signals: ParsedSignal[]): AlertFiring[] {
  const firings: AlertFiring[] = [];
  const conflicts = signals.filter((s) => s.action === COMMIT_CONFLICT_ACTION);

  const divergent = conflicts.filter((s) => s.errorCode === "divergent-reimport");
  if (divergent.length > 0) {
    firings.push({
      code: "divergent-reimport",
      count: divergent.length,
      detail:
        "Re-import of an existing round with DIFFERENT answers was rejected — someone may be trying to silently rewrite history.",
    });
  }

  const unexpected = conflicts.filter((s) => s.errorCode === "unexpected-error");
  if (unexpected.length > 0) {
    firings.push({
      code: "unexpected-error",
      count: unexpected.length,
      detail: "An import commit failed with an UNEXPECTED (non-domain) error — investigate.",
    });
  }

  const denials = conflicts.filter((s) => s.errorCode && DENIAL_CODES.has(s.errorCode));
  if (denials.length > DENIAL_BURST_THRESHOLD) {
    firings.push({
      code: "denial-burst",
      count: denials.length,
      detail:
        "Burst of entitlement/provenance denials — a wrong-org workflow issue or a broken entitlement check.",
    });
  }

  const latencies = signals
    .filter((s) => s.action === COMMIT_RESULT_ACTION)
    .map((s) => s.latencyMs)
    .filter((v): v is number => typeof v === "number");
  const p = p95(latencies);
  if (p !== null && p > LATENCY_P95_THRESHOLD_MS) {
    firings.push({
      code: "latency-p95",
      count: latencies.length,
      detail: `Commit latency p95 ${Math.round(p)}ms exceeds ${LATENCY_P95_THRESHOLD_MS}ms — investigate before the route times out.`,
    });
  }

  return firings;
}

/** PII-free alert email (codes + counts + span bounds only). */
export function buildAlertEmail(
  firings: AlertFiring[],
  spanStart: Date,
  spanEnd: Date,
): { subject: string; text: string; html: string } {
  const codes = firings.map((f) => f.code).join(", ");
  const subject = `[Scaling Up] Import alert: ${codes}`;
  const lines = firings.map((f) => `- ${f.code} (×${f.count}): ${f.detail}`);
  const text = [
    "Esperto-import alert conditions fired (runbook 18o §7):",
    "",
    ...lines,
    "",
    `Span: ${spanStart.toISOString()} → ${spanEnd.toISOString()}`,
    "Runbook: docs/specs/v7.6/18o-ops-runbook.md §7 / §10 (on-call decision tree).",
  ].join("\n");
  const html = [
    "<p>Esperto-import alert conditions fired (runbook 18o §7):</p>",
    "<ul>",
    ...firings.map(
      (f) => `<li><strong>${f.code}</strong> (×${f.count}): ${f.detail}</li>`,
    ),
    "</ul>",
    `<p>Span: ${spanStart.toISOString()} → ${spanEnd.toISOString()}</p>`,
    "<p>Runbook: docs/specs/v7.6/18o-ops-runbook.md §7 / §10 (on-call decision tree).</p>",
  ].join("\n");
  return { subject, text, html };
}

export interface AlertSweepDeps {
  db: AlertSweepDb;
  now: Date;
  sendEmail: (opts: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<void>;
}

/**
 * One cron tick: checkpoint read → span query → evaluate → checkpoint write
 * (BEFORE send) → consolidated email when anything fired.
 * Never throws — the cron reports the outcome instead.
 */
export async function runImportAlertSweep(
  deps: AlertSweepDeps,
): Promise<AlertSweepOutcome> {
  if (!isImportAlertingEnabled()) {
    return { skipped: "flag-off", fired: [], emailed: false };
  }
  const { db, now } = deps;

  // 1) Cursor: latest checkpoint's processedThrough, else bootstrap 10min back.
  const checkpoint = await db.auditLog.findFirst({
    where: { entityType: ALERT_CRON_ENTITY_TYPE, action: ALERT_CRON_RUN_ACTION },
    orderBy: { timestamp: "desc" },
  });
  let spanStart = new Date(now.getTime() - BOOTSTRAP_SPAN_MS);
  if (checkpoint) {
    try {
      const parsed: unknown = JSON.parse(checkpoint.changes);
      const t =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).processedThrough
          : undefined;
      if (typeof t === "string" && !Number.isNaN(Date.parse(t))) {
        spanStart = new Date(t);
      }
    } catch {
      // Malformed checkpoint — fall back to the bootstrap span.
    }
  }

  // 2) Span query on the indexed timestamp (@@index([timestamp])).
  const rows = await db.auditLog.findMany({
    where: {
      entityType: ALERT_SIGNAL_ENTITY_TYPE,
      timestamp: { gt: spanStart, lte: now },
    },
    orderBy: { timestamp: "asc" },
    take: MAX_SIGNALS_PER_SWEEP,
  });

  // 3) Evaluate §7 A/A2/B/C.
  const firings = evaluateAlertConditions(parseSignals(rows));
  const fired = firings.map((f) => f.code);

  // 4) Checkpoint BEFORE send — the retry-safe dedup anchor.
  try {
    await db.auditLog.create({
      data: {
        entityType: ALERT_CRON_ENTITY_TYPE,
        entityId: ALERT_CRON_SINGLETON_ID,
        action: ALERT_CRON_RUN_ACTION,
        performedBy: "SYSTEM",
        changes: JSON.stringify({
          processedThrough: now.toISOString(),
          spanStart: spanStart.toISOString(),
          evaluated: rows.length,
          fired,
        }),
      },
    });
  } catch (err) {
    // Without the checkpoint we must NOT send (a retry would double-email).
    console.error(
      JSON.stringify({
        marker: "assessment.esperto_import.alert_checkpoint_failed",
        surface: "esperto_import_alerting",
        message: err instanceof Error ? err.message : "unknown",
      }),
    );
    return {
      spanStart: spanStart.toISOString(),
      spanEnd: now.toISOString(),
      evaluated: rows.length,
      fired,
      emailed: false,
      error: "checkpoint-failed",
    };
  }

  // 5) Send (consolidated) — ADMIN_EMAIL is REQUIRED for alerting: no silent
  //    fallback address (Codex C5). Missing env + something fired = loud error.
  let emailed = false;
  let error: AlertSweepOutcome["error"];
  if (firings.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error(
        JSON.stringify({
          marker: "assessment.esperto_import.alert_email_unconfigured",
          surface: "esperto_import_alerting",
          fired,
        }),
      );
      error = "missing-admin-email";
    } else {
      const email = buildAlertEmail(firings, spanStart, now);
      try {
        await deps.sendEmail({ to: adminEmail, ...email });
        emailed = true;
      } catch (err) {
        console.error(
          JSON.stringify({
            marker: "assessment.esperto_import.alert_email_failed",
            surface: "esperto_import_alerting",
            fired,
            message: err instanceof Error ? err.message : "unknown",
          }),
        );
        error = "send-failed";
      }
    }
  }

  return {
    spanStart: spanStart.toISOString(),
    spanEnd: now.toISOString(),
    evaluated: rows.length,
    fired,
    emailed,
    ...(error ? { error } : {}),
  };
}
