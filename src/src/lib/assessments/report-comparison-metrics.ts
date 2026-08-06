export type ReportComparisonMetricEvent =
  | "candidate_ok"
  | "candidate_empty"
  | "candidate_failed"
  | "comparison_ok"
  | "comparison_invalid";

/** Deliberately low-cardinality fields: never add report, person, or answer data. */
export interface ReportComparisonMetricFields {
  viewer: "COACH" | "ADMIN" | "STAFF" | "CEO_SELF" | "UNKNOWN";
  count?: number;
  bounded?: boolean;
  sameVersion?: boolean;
  matchedQuestions?: number;
  unmatchedQuestions?: number;
  latencyMs?: number;
  reason?: "missing" | "forbidden" | "incompatible" | "error";
}

export function emitReportComparisonMetric(
  event: ReportComparisonMetricEvent,
  fields: ReportComparisonMetricFields,
): void {
  console.info("assessment.report_comparison." + event, fields);
}
