/**
 * Assessment v7.6 Wave F #22 (R3-M1) — group-report structured ops metrics.
 *
 * A single, dependency-free emitter for the `assessment.group_report.*` signal
 * set the group report (route `/assessments/[id]/report`, loader
 * `group-report.ts`, model `group-report-model.ts`) needs for operational
 * visibility — render outcome/latency, render failures, degraded rows,
 * authorization denials, orphan submissions, audit failures, and rate-limit
 * hits.
 *
 * This deliberately reuses the EXISTING structured-log convention already used
 * across the assessment surfaces (e.g. `assessment.report.view`,
 * `assessment.report.old_result_api.hit`): a single `console.info(JSON.stringify(
 * { marker, ...fields }))` line that log-shippers / `/admin/observability`
 * (DB-derived) / a future time-series backend can parse. We do NOT invent a new
 * metrics backend.
 *
 * Two surfacing paths exist, by design:
 *   1) `/admin/observability` derives a "Group reports (last 24h)" panel from
 *      the `GROUP_REPORT_VIEW` AuditLog rows the route writes on the OK path
 *      (the live, queryable count of successful views).
 *   2) These structured markers carry the rest of the signal set — including
 *      the outcomes that intentionally write NO audit row (rate_limited,
 *      authz_deny, not_applicable, empty, render_failure, audit_failure) plus
 *      latency and degraded/orphan counts — for log-derived queries + alerting.
 *      The runbook (T12) documents the log queries + alert gates.
 *
 * PII CONTRACT (CRITICAL): markers carry ONLY low-cardinality, NON-PII fields —
 * role, reportType, counts (completedCount / invitedCount / degradedCount /
 * orphanCount), latencyMs, an error CLASS name. NEVER names, emails, job
 * titles, answer text, or free-form messages. `GroupReportMetricFields` lists
 * the allowed keys; do not widen it with identifying fields.
 */

/** The structured `assessment.group_report.<event>` event names. */
export type GroupReportMetricEvent =
  | "view" // a successful render (outcome ok), carries latencyMs
  | "rate_limited" // request shed before the load
  | "authz_deny" // forbidden by the bulk-PII gate
  | "not_applicable" // PUBLIC campaign — no team group report
  | "empty" // zero completions
  | "render_failure" // the catch around load/audit/render threw
  | "audit_failure" // the fail-closed GROUP_REPORT_VIEW audit write threw
  | "degraded" // ≥1 answer failed normalization (submission kept)
  | "orphan_submission"; // ≥1 submission whose respondent isn't a participant

/**
 * The ONLY fields a group-report metric may carry. All optional, all
 * low-cardinality + PII-free. Keep this allowlist tight — never add a field
 * that could identify a person or leak answer content.
 */
export interface GroupReportMetricFields {
  /** Actor role (ADMIN | STAFF | COACH) or null when unauthenticated. */
  role?: string | null;
  /** Resolved report archetype (scored | qualitative). */
  reportType?: string | null;
  /** Pinned template alias (low-cardinality instrument id, e.g. "lva"). */
  template?: string | null;
  /** Completed (cohort) submission count. */
  completedCount?: number;
  /** Non-revoked invitation count. */
  invitedCount?: number;
  /** Number of cohort members whose submission isn't a participant row. */
  orphanCount?: number;
  /** 1 when the report degraded (≥1 dropped answer), else 0 — boolean is also accepted. */
  degraded?: boolean;
  /** Render (load + render) wall-clock latency in ms. */
  latencyMs?: number;
  /** Error CLASS name only (e.g. "Error") — NEVER the message (may carry PII). */
  errorClass?: string;
}

// Identifying / free-form keys that must NEVER appear on a metric. Enforced at
// runtime (defensive) so a future careless caller can't leak PII through here.
const FORBIDDEN_FIELD_KEYS = new Set([
  "name",
  "email",
  "answer",
  "answers",
  "message",
  "respondentId",
  "respondentIds",
  "submissionId",
  "submissionIds",
  "ip",
  "ipAddress",
  "userAgent",
  "jobTitle",
]);

/**
 * Emit one `assessment.group_report.<event>` structured marker.
 *
 * Mirrors the codebase's `console.info(JSON.stringify({ marker, ... }))`
 * convention exactly. Strips any forbidden (PII / high-cardinality) field
 * defensively before logging, and never throws (instrumentation must never
 * break the request path).
 */
export function emitGroupReportMetric(
  event: GroupReportMetricEvent,
  fields: GroupReportMetricFields = {},
): void {
  try {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (FORBIDDEN_FIELD_KEYS.has(key)) continue;
      if (value === undefined) continue;
      safe[key] = value;
    }
    console.info(
      JSON.stringify({
        marker: `assessment.group_report.${event}`,
        ...safe,
      }),
    );
  } catch {
    // Instrumentation is best-effort — never let a logging failure surface.
  }
}
