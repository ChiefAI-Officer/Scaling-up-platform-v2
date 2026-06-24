/**
 * Report access gate — surface-tagged structured ops metric (PR1).
 *
 * The generalization of `emitGroupReportMetric` across report-viewing surfaces
 * (per-respondent Results report + campaign Aggregate report). Same
 * `console.info(JSON.stringify({ marker, surface, ...fields }))` convention and
 * the same defensive PII strip. Per-surface marker namespace keeps existing
 * greps + the `/admin/observability` derivations working — the group surface
 * stays `assessment.group_report.*` byte-for-byte (plus an additive `surface`
 * field), and the per-respondent report gets its own `assessment.respondent_report.*`
 * namespace (retiring its ad-hoc `console.info({ marker: "assessment.report.view" })`).
 *
 * PII CONTRACT (CRITICAL): markers carry ONLY low-cardinality, NON-PII fields —
 * role, reportType, counts, latencyMs, an error CLASS name. NEVER names, emails,
 * job titles, answer text, free-form messages, ids, IP, or user-agent. The strip
 * below is defensive; callers must also never PASS identifying fields.
 */

export type ReportSurface = "respondent" | "group";

/** The structured `assessment.<surface>_report.<event>` event names. */
export type ReportMetricEvent =
  | "view" // a successful render (outcome ok)
  | "rate_limited" // request shed before the load
  | "authz_deny" // forbidden by the authorization gate
  | "not_applicable" // PUBLIC campaign — no team group report
  | "empty" // zero completions
  | "render_failure" // the load/audit path threw
  | "audit_failure" // the fail-closed audit write threw
  | "degraded" // >=1 answer failed normalization (submission kept)
  | "orphan_submission" // >=1 submission whose respondent isn't a participant
  | "email"; // a report EMAIL was rendered/enqueued (durable filter-provenance trace; R2-M4)

const SURFACE_NAMESPACE: Record<ReportSurface, string> = {
  respondent: "respondent_report",
  group: "group_report",
};

// Identifying / free-form keys that must NEVER appear on a metric. Enforced at
// runtime (defensive) so a careless caller can't leak PII through here.
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
 * Emit one `assessment.<surface>_report.<event>` structured marker. Strips any
 * forbidden (PII / high-cardinality) field defensively before logging, and
 * never throws (instrumentation must never break the request path).
 */
export function emitReportMetric(
  surface: ReportSurface,
  event: ReportMetricEvent,
  fields: Record<string, unknown> = {},
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
        marker: `assessment.${SURFACE_NAMESPACE[surface]}.${event}`,
        surface,
        ...safe,
      }),
    );
  } catch {
    // Instrumentation is best-effort — never let a logging failure surface.
  }
}
