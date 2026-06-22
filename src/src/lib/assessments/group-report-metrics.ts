/**
 * Assessment v7.6 Wave F #22 (R3-M1) — group-report structured ops metrics.
 *
 * Now a thin, surface-bound wrapper over the shared `emitReportMetric`
 * (`report-metrics.ts`). It preserves this surface's public contract exactly —
 * the `assessment.group_report.<event>` marker namespace (now with an additive
 * `surface: "group"` field), the `GroupReportMetricFields` allowlist, and the
 * `GroupReportMetricEvent` names — so every existing caller (the group report
 * route, `group-report.ts`) is untouched. The PII strip + the
 * `console.info(JSON.stringify(...))` convention live in the shared emitter.
 *
 * PII CONTRACT (CRITICAL): markers carry ONLY low-cardinality, NON-PII fields.
 * `GroupReportMetricFields` lists the allowed keys; do not widen it with
 * identifying fields. The shared emitter strips forbidden keys defensively.
 */

import { emitReportMetric, type ReportMetricEvent } from "./report-metrics";

/** The structured `assessment.group_report.<event>` event names. */
export type GroupReportMetricEvent = ReportMetricEvent;

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
  /** 1 when the report degraded (>=1 dropped answer), else 0 — boolean is also accepted. */
  degraded?: boolean;
  /** Render (load + render) wall-clock latency in ms. */
  latencyMs?: number;
  /** Error CLASS name only (e.g. "Error") — NEVER the message (may carry PII). */
  errorClass?: string;
}

/**
 * Emit one `assessment.group_report.<event>` structured marker. Delegates to the
 * shared `emitReportMetric` with `surface: "group"` (which owns the PII strip,
 * the marker convention, and never throws).
 */
export function emitGroupReportMetric(
  event: GroupReportMetricEvent,
  fields: GroupReportMetricFields = {},
): void {
  emitReportMetric("group", event, fields as Record<string, unknown>);
}
