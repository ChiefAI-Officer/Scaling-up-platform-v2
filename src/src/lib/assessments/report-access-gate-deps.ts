import { db } from "@/lib/db";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import type { ReportGateDeps } from "@/lib/assessments/report-gate-core";
import { emitReportMetric } from "@/lib/assessments/report-metrics";

/** First-hop client IP, shared by the surface-specific report adapters. */
export function ipFromHeaders(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "localhost"
  );
}

/**
 * Production dependencies for the pure report-access gate.
 *
 * This neutral wiring module intentionally imports no report loader or
 * appearance policy, so an Aggregate-report route cannot reach an individual
 * Results-report dependency merely by sharing the cross-cutting gate protocol.
 */
export function defaultReportGateDeps(): ReportGateDeps {
  return {
    auditSink: db.auditLog as unknown as ReportGateDeps["auditSink"],
    rateLimiter: checkRateLimitAsync,
    emitMetric: emitReportMetric,
  };
}
