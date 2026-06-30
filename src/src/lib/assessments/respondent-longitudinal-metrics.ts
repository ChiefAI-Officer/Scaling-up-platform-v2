/**
 * Assessment v7.6 Wave N (#23, R3-Med-1) — per-respondent longitudinal
 * structured ops metrics.
 *
 * Mirrors `group-report-metrics.ts`: a thin, PII-free wrapper that emits
 * `assessment.respondent_longitudinal.<event>` structured markers via the same
 * `console.info(JSON.stringify(...))` convention the rest of the assessments
 * observability stack uses (`assessment.group_report.*`,
 * `assessment.respondent_report.*`). These markers feed the log-drain alert
 * queries + the `/admin/observability` derivations; they land BEFORE any flag
 * flip (plan §19).
 *
 * PII CONTRACT (CRITICAL): markers carry ONLY low-cardinality, NON-PII fields —
 * role, reportType, the loader's audit-safe counts (matched-respondent count,
 * submission count, comparable count), a degraded flag, a latency, an error
 * CLASS name, and a low-cardinality not-applicable reason. NEVER names, emails,
 * job titles, answer text, ids, IP, or user-agent. The strip below is
 * defensive; callers must also never PASS identifying fields.
 */

/** The structured `assessment.respondent_longitudinal.<event>` event names. */
export type RespondentLongitudinalMetricEvent =
  | "view" // a successful render (outcome ok)
  | "not_applicable" // qualitative template — nothing to trend
  | "empty" // matched person has zero plottable submissions
  | "degraded" // >=1 plotted column degraded (malformed result / same-campaign collapse)
  | "authz_deny" // forbidden by the org/template authorization gates (route 404s)
  | "render_failure"; // the load / audit path threw

/**
 * The ONLY fields a respondent-longitudinal metric may carry. All optional, all
 * low-cardinality + PII-free. Keep this allowlist tight — never add a field
 * that could identify a person or leak answer content.
 */
export interface RespondentLongitudinalMetricFields {
  /** Actor role (ADMIN | STAFF | COACH) or null when unauthenticated. */
  role?: string | null;
  /** Resolved report archetype (scored | qualitative). */
  reportType?: string | null;
  /** Pinned template alias (low-cardinality instrument id, e.g. "RockHabits"). */
  template?: string | null;
  /** Audit-safe count of OrgRespondent rows unioned by email (no emails). */
  matchedRespondentCount?: number;
  /** Audit-safe count of submissions plotted (post-collapse, post-bound). */
  submissionCount?: number;
  /** Number of plotted points with a same-version chronological predecessor. */
  comparableCount?: number;
  /** True when >=1 plotted column degraded (malformed result / collapse). */
  degraded?: boolean;
  /** True when the column / submission set was truncated by the bounds. */
  bounded?: boolean;
  /** Render (load + render) wall-clock latency in ms. */
  latencyMs?: number;
  /** Error CLASS name only (e.g. "Error") — NEVER the message (may carry PII). */
  errorClass?: string;
  /** Low-cardinality reason for a not_applicable outcome ("qualitative-template"). */
  reason?: string;
}

const NAMESPACE = "assessment.respondent_longitudinal";

// Identifying / free-form keys that must NEVER appear on a metric. Enforced at
// runtime (defensive) so a careless caller can't leak PII through here. Mirrors
// the shared report-metrics FORBIDDEN_FIELD_KEYS set.
const FORBIDDEN_FIELD_KEYS = new Set([
  "name",
  "email",
  "emails",
  "answer",
  "answers",
  "message",
  "respondentId",
  "respondentIds",
  "submissionId",
  "submissionIds",
  "companyName",
  "ip",
  "ipAddress",
  "userAgent",
  "jobTitle",
]);

/**
 * Emit one `assessment.respondent_longitudinal.<event>` structured marker.
 * Strips any forbidden (PII / high-cardinality) field defensively before
 * logging, and never throws (instrumentation must never break the request path).
 */
export function emitRespondentLongitudinalMetric(
  event: RespondentLongitudinalMetricEvent,
  fields: RespondentLongitudinalMetricFields = {},
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
        marker: `${NAMESPACE}.${event}`,
        surface: "respondent_longitudinal",
        ...safe,
      }),
    );
  } catch {
    // Instrumentation is best-effort — never let a logging failure surface.
  }
}
