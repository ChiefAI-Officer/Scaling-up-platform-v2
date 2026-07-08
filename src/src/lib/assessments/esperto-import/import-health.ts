/**
 * Wave Y — import-health summary for the admin observability panel (READ-only).
 *
 * Pure + defensive: reads AuditLog rows and returns a PII-free rollup. It shows
 * the alert cron's ACTUAL decisions (its checkpoint rows) — NOT a re-evaluation
 * of thresholds over the wrong window (spec 19y D6, Codex C3). It therefore does
 * NOT import `parseSignals`/`evaluateAlertConditions` from `alert-signals.ts`;
 * only the read-only row/action CONSTANTS, so the cron module stays untouched.
 *
 * Honesty (D15, Codex C5): TOTAL counts come from `count()` (complete, never
 * capped). The by-code / by-outcome / latency breakdowns must parse the
 * `changes` JSON (those fields aren't SQL-queryable), so they come from a capped
 * row fetch and carry a `truncated` flag — a capped rollup never masquerades as
 * complete.
 */
import {
  ALERT_SIGNAL_ENTITY_TYPE,
  COMMIT_RESULT_ACTION,
  COMMIT_CONFLICT_ACTION,
  ALERT_CRON_ENTITY_TYPE,
  ALERT_CRON_RUN_ACTION,
} from "./alert-signals";
import {
  ACTIVITY_ENTITY_TYPE,
  PREVIEW_RESULT_ACTION,
  REFUSED_ACTION,
} from "./import-activity-signals";
import { isImportAlertingEnabled } from "@/lib/assessments/wave-v-flags";

// ── Tunables ─────────────────────────────────────────────────────────────
/** Cron runs every 10 min; > 3 missed ticks (30 min) with the flag ON = "stale". */
const STALE_MS = 30 * 60 * 1000;
/** Bound the parsed-breakdown row fetch. Beyond this, breakdowns set `truncated`. */
const SCAN_CAP = 2000;
/** Recent-signals table size. */
const RECENT_LIMIT = 50;

// ── DB shape (read; concrete so the real Prisma client is assignable) ───────
interface AuditRow {
  action: string;
  entityId: string;
  changes: string;
  timestamp: Date;
}
type AuditWhere = {
  entityType?: string | { in: string[] };
  action?: string;
  timestamp?: { gte?: Date; gt?: Date; lte?: Date };
};
export interface ImportHealthDb {
  auditLog: {
    count: (args: { where: AuditWhere }) => Promise<number>;
    findMany: (args: {
      where: AuditWhere;
      orderBy: { timestamp: "asc" | "desc" };
      take: number;
    }) => Promise<AuditRow[]>;
  };
}

// ── Output shape ────────────────────────────────────────────────────────
export interface FiringSummary {
  code: string;
  /** Number of sweeps in the window in which this condition fired. */
  count: number;
  lastFiredAt: string;
}
export interface VolumeWindow {
  commitResults: number; // uncapped totals
  commitConflicts: number;
  refusals: number;
  previewDegraded: number;
  commitResultsByOutcome: Record<string, number>; // parsed (capped)
  commitConflictsByCode: Record<string, number>;
  refusalsByCode: Record<string, number>;
  /** Reference only — NOT the alert trigger (condition C is a per-10-min-span p95). */
  latencyP95Ms: number | null;
  /** True when the parsed-breakdown fetch hit SCAN_CAP → breakdowns may undercount. */
  truncated: boolean;
}
export interface RecentSignal {
  at: string;
  entityType: string;
  action: string;
  org: string;
  code: string | null;
  outcome: string | null;
  latencyMs: number | null;
}
export interface ImportHealthSummary {
  generatedAt: string;
  alerting: { enabled: boolean };
  cron: {
    lastSweptAt: string | null;
    processedThrough: string | null;
    sweeps24h: number;
    evaluated24h: number;
    health: "disabled" | "healthy" | "stale";
    staleMinutes: number | null;
  };
  history: { last24h: FiringSummary[]; last7d: FiringSummary[] };
  volume: { last24h: VolumeWindow; last7d: VolumeWindow };
  recent: RecentSignal[];
}

// ── Parsing helpers (defensive — a malformed row never throws) ──────────────
function parseChanges(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* malformed row — ignore */
  }
  return {};
}
function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** p95 by nearest-rank: sorted[ceil(0.95·n) - 1]. */
function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}
function bump(map: Record<string, number>, key: string | null): void {
  if (key === null) return;
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * A window's parsed breakdowns are truncated ONLY if the capped, newest-first
 * fetch dropped rows that fall INSIDE that window. If the fetch wasn't capped,
 * or the oldest kept row is already older than the window start, the window is
 * complete — so a low-24h/high-7d org never gets a false "incomplete" warning
 * on its (complete) 24h view (Wave Y review LOW-2).
 */
function windowTruncated(rows: AuditRow[], since: Date): boolean {
  if (rows.length < SCAN_CAP) return false;
  const oldestKept = rows[rows.length - 1]?.timestamp; // desc fetch → last is oldest
  return oldestKept !== undefined && oldestKept.getTime() > since.getTime();
}

function buildVolumeWindow(
  importRows: AuditRow[],
  activityRows: AuditRow[],
  since: Date,
  totals: { commitResults: number; commitConflicts: number; refusals: number; previewDegraded: number },
): VolumeWindow {
  const byOutcome: Record<string, number> = {};
  const byCode: Record<string, number> = {};
  const refusalsByCode: Record<string, number> = {};
  const latencies: number[] = [];
  for (const row of importRows) {
    if (row.timestamp < since) continue;
    const c = parseChanges(row.changes);
    if (row.action === COMMIT_RESULT_ACTION) {
      bump(byOutcome, str(c.outcome));
      const l = num(c.latencyMs);
      if (l !== null) latencies.push(l);
    } else if (row.action === COMMIT_CONFLICT_ACTION) {
      bump(byCode, str(c.errorCode));
    }
  }
  for (const row of activityRows) {
    if (row.timestamp < since) continue;
    if (row.action === REFUSED_ACTION) {
      bump(refusalsByCode, str(parseChanges(row.changes).code));
    }
  }
  return {
    commitResults: totals.commitResults,
    commitConflicts: totals.commitConflicts,
    refusals: totals.refusals,
    previewDegraded: totals.previewDegraded,
    commitResultsByOutcome: byOutcome,
    commitConflictsByCode: byCode,
    refusalsByCode,
    latencyP95Ms: p95(latencies),
    truncated: windowTruncated(importRows, since) || windowTruncated(activityRows, since),
  };
}

function buildFiringHistory(checkpointRows: AuditRow[], since: Date): FiringSummary[] {
  const byCode = new Map<string, { count: number; lastFiredAt: string }>();
  for (const row of checkpointRows) {
    if (row.timestamp < since) continue;
    const fired = parseChanges(row.changes).fired;
    if (!Array.isArray(fired)) continue;
    const at = row.timestamp.toISOString();
    for (const code of fired) {
      if (typeof code !== "string") continue;
      const prev = byCode.get(code);
      if (!prev) byCode.set(code, { count: 1, lastFiredAt: at });
      else byCode.set(code, { count: prev.count + 1, lastFiredAt: at > prev.lastFiredAt ? at : prev.lastFiredAt });
    }
  }
  return [...byCode.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.count - a.count);
}

export async function buildImportHealthSummary(deps: {
  db: ImportHealthDb;
  now: Date;
}): Promise<ImportHealthSummary> {
  const { db, now } = deps;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const alertingEnabled = isImportAlertingEnabled();

  const importWhere = { entityType: ALERT_SIGNAL_ENTITY_TYPE } as const;
  const count = (where: AuditWhere) => db.auditLog.count({ where });

  const [
    // Uncapped totals — 7d (24h derived from these where the action is the same window subset).
    cr24, cr7, cc24, cc7, rf24, rf7, pv24, pv7, sweeps24h,
    // Capped parsed fetches (7d; 24h derived in-app by timestamp filter).
    importRows, activityRows, checkpointRows,
  ] = await Promise.all([
    count({ ...importWhere, action: COMMIT_RESULT_ACTION, timestamp: { gte: oneDayAgo } }),
    count({ ...importWhere, action: COMMIT_RESULT_ACTION, timestamp: { gte: sevenDaysAgo } }),
    count({ ...importWhere, action: COMMIT_CONFLICT_ACTION, timestamp: { gte: oneDayAgo } }),
    count({ ...importWhere, action: COMMIT_CONFLICT_ACTION, timestamp: { gte: sevenDaysAgo } }),
    count({ entityType: ACTIVITY_ENTITY_TYPE, action: REFUSED_ACTION, timestamp: { gte: oneDayAgo } }),
    count({ entityType: ACTIVITY_ENTITY_TYPE, action: REFUSED_ACTION, timestamp: { gte: sevenDaysAgo } }),
    count({ entityType: ACTIVITY_ENTITY_TYPE, action: PREVIEW_RESULT_ACTION, timestamp: { gte: oneDayAgo } }),
    count({ entityType: ACTIVITY_ENTITY_TYPE, action: PREVIEW_RESULT_ACTION, timestamp: { gte: sevenDaysAgo } }),
    count({ entityType: ALERT_CRON_ENTITY_TYPE, action: ALERT_CRON_RUN_ACTION, timestamp: { gte: oneDayAgo } }),
    db.auditLog.findMany({ where: { entityType: ALERT_SIGNAL_ENTITY_TYPE, timestamp: { gte: sevenDaysAgo } }, orderBy: { timestamp: "desc" }, take: SCAN_CAP }),
    db.auditLog.findMany({ where: { entityType: ACTIVITY_ENTITY_TYPE, timestamp: { gte: sevenDaysAgo } }, orderBy: { timestamp: "desc" }, take: SCAN_CAP }),
    db.auditLog.findMany({ where: { entityType: ALERT_CRON_ENTITY_TYPE, action: ALERT_CRON_RUN_ACTION, timestamp: { gte: sevenDaysAgo } }, orderBy: { timestamp: "desc" }, take: SCAN_CAP }),
  ]);

  // ── Cron health from the latest checkpoint + the flag (D8). ───────────────
  const latest = checkpointRows[0] ?? null; // findMany desc → [0] is newest
  const lastSweptAt = latest ? latest.timestamp.toISOString() : null;
  const processedThrough = latest ? str(parseChanges(latest.changes).processedThrough) : null;
  let evaluated24h = 0;
  for (const row of checkpointRows) {
    if (row.timestamp < oneDayAgo) continue;
    evaluated24h += num(parseChanges(row.changes).evaluated) ?? 0;
  }
  const staleMs = latest ? now.getTime() - latest.timestamp.getTime() : null;
  const staleMinutes = staleMs === null ? null : Math.floor(staleMs / 60000);
  const health: "disabled" | "healthy" | "stale" = !alertingEnabled
    ? "disabled"
    : latest && staleMs !== null && staleMs <= STALE_MS
      ? "healthy"
      : "stale";

  // ── Recent (last 50 across both signal entityTypes, time-desc). ───────────
  const recent: RecentSignal[] = [...importRows, ...activityRows]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, RECENT_LIMIT)
    .map((row) => {
      const c = parseChanges(row.changes);
      const isImport = row.action === COMMIT_RESULT_ACTION || row.action === COMMIT_CONFLICT_ACTION;
      return {
        at: row.timestamp.toISOString(),
        entityType: isImport ? ALERT_SIGNAL_ENTITY_TYPE : ACTIVITY_ENTITY_TYPE,
        action: row.action,
        org: row.entityId,
        code: str(c.errorCode) ?? str(c.code),
        outcome: str(c.outcome),
        latencyMs: num(c.latencyMs),
      };
    });

  return {
    generatedAt: now.toISOString(),
    alerting: { enabled: alertingEnabled },
    cron: { lastSweptAt, processedThrough, sweeps24h, evaluated24h, health, staleMinutes },
    history: {
      last24h: buildFiringHistory(checkpointRows, oneDayAgo),
      last7d: buildFiringHistory(checkpointRows, sevenDaysAgo),
    },
    volume: {
      last24h: buildVolumeWindow(importRows, activityRows, oneDayAgo, { commitResults: cr24, commitConflicts: cc24, refusals: rf24, previewDegraded: pv24 }),
      last7d: buildVolumeWindow(importRows, activityRows, sevenDaysAgo, { commitResults: cr7, commitConflicts: cc7, refusals: rf7, previewDegraded: pv7 }),
    },
    recent,
  };
}
