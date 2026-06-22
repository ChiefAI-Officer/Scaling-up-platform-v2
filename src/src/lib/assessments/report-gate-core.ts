/**
 * Report access gate — PURE core (PR1).
 *
 * The single place the cross-cutting report-view protocol lives: no-actor
 * policy, optional flag gate, the rate-limit guard, fail-closed audit, and the
 * request-ending metric emissions. It wraps a caller-supplied loader (passed via
 * `opts.load`) that owns domain authorization and returns its own discriminated
 * outcome, which the gate interprets through a single `classify(o) ->
 * ReportDisposition`. On `ok` it writes the audit and returns the outcome
 * unchanged; on `passthrough` (empty / notApplicable) it returns the outcome
 * unchanged for the PAGE to render; on `forbidden` / `not-found` it 404s.
 *
 * STRUCTURAL bug-prevention (ADR-0012, Codex co-validate C1): notFound() and
 * redirect() are called ONLY OUTSIDE any try block, and the loader never throws
 * Next control-flow — so the swallowed-404 bug (a fail-closed notFound() caught
 * by its own try and silently dropped) is structurally impossible, and this
 * module uses ZERO unstable_rethrow.
 *
 * This file is intentionally PURE: its only runtime import is next/navigation.
 * Everything else (db, headers, the loaders, the flags, the rate limiter, the
 * metric emitter) is supplied via `deps`/`opts` so the protocol is a unit under
 * test against fakes. The two adapters live in report-access-gate.ts.
 */

import { notFound, redirect } from "next/navigation";
import type { ApiActor } from "@/lib/auth/access-control";
import type { AuditAction } from "@/lib/audit";
import type { RateLimitConfig, RateLimitResult } from "@/lib/rate-limit";
import type { ReportSurface, ReportMetricEvent } from "@/lib/assessments/report-metrics";

/** Exactly the AuditLog columns the gate writes — keeps the core decoupled from Prisma's types. */
export interface ReportAuditWrite {
  entityType: string;
  entityId: string;
  action: AuditAction;
  performedBy: string;
  changes: string;
  ipAddress: string;
  userAgent: string | null;
}

/** Injected dependencies — the test surface. */
export interface ReportGateDeps {
  // Structural { create } the full Prisma client satisfies (the adapter casts at
  // the single wiring point in defaultReportGateDeps); fakes satisfy it directly.
  auditSink: { create: (args: { data: ReportAuditWrite }) => Promise<unknown> };
  rateLimiter: (id: string, config: RateLimitConfig) => Promise<RateLimitResult>;
  emitMetric: (surface: ReportSurface, event: ReportMetricEvent, fields?: Record<string, unknown>) => void;
}

export type ReportDisposition = "ok" | "forbidden" | "not-found" | "passthrough";

/** What the gate writes to the audit row's domain fields (the gate adds performedBy/ip/ua). */
export interface ReportAuditSpec {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: Record<string, unknown>; // gate JSON.stringifies (parity with logAudit)
}

export type NoActorPolicy = "redirect-login" | "tolerate";

export interface ViewReportOptions<TOutcome> {
  surface: ReportSurface;
  actor: ApiActor | null;
  noActorPolicy: NoActorPolicy;
  /** group: () => isGroupReportEnabled(actor, {id}); respondent: omitted. */
  flagGate?: () => boolean;
  ip: string;
  userAgent: string | null;
  rateLimitKey: string;
  rateLimitConfig: RateLimitConfig;
  /** The loader call. Returns the loader's real discriminated union; never throws Next control-flow. */
  load: () => Promise<TOutcome>;
  /** Single total classifier (replaces isOk/isForbidden/emitAuthzDeny). */
  classify: (o: TOutcome) => ReportDisposition;
  /** Called ONLY when classify(o) === "ok"; the adapter narrows the ok-variant. */
  auditOf: (o: TOutcome) => ReportAuditSpec;
  /** Surface fields for the audit_failure metric (group: { template }); optional. */
  auditFailureFields?: (o: TOutcome) => Record<string, unknown>;
  metricRole: string | null;
}

/**
 * Run the report-view protocol. Returns the loader outcome UNCHANGED for the
 * page to switch on (ok / passthrough). May THROW Next control-flow
 * (notFound / redirect). Emits ONLY request-ending events; `view` and all
 * success-render metrics are PAGE-owned (the gate returns before render).
 */
export async function viewReport<TOutcome>(
  deps: ReportGateDeps,
  opts: ViewReportOptions<TOutcome>,
): Promise<TOutcome> {
  const emit = (event: ReportMetricEvent, fields?: Record<string, unknown>) =>
    deps.emitMetric(opts.surface, event, { role: opts.metricRole, ...(fields ?? {}) });
  const startedAt = Date.now();

  // 1. No-actor policy — throws OUTSIDE any try.
  if (!opts.actor && opts.noActorPolicy === "redirect-login") redirect("/login");

  // 2. Flag gate FIRST — before any rate-limit or DB work; throws OUTSIDE any try.
  if (opts.flagGate && !opts.flagGate()) notFound();

  // 3. Rate-limit — the try wraps ONLY the limiter call. notFound() is called AFTER
  //    the catch, so the fail-closed 404 can never be swallowed. Fail-closed on
  //    EXCEEDED; fail-open on a limiter OUTAGE.
  let rateLimited = false;
  try {
    const rl = await deps.rateLimiter(opts.rateLimitKey, opts.rateLimitConfig);
    rateLimited = !rl.success;
  } catch (err) {
    console.error("[report-gate] rate limiter unavailable; proceeding (fail-open)", err);
  }
  if (rateLimited) {
    emit("rate_limited");
    notFound(); // OUTSIDE the try
  }

  // 4. Load — loaders return discriminated unions and NEVER throw Next control-flow,
  //    so this catch only sees genuine errors (no unstable_rethrow needed).
  //    INVARIANT: if a future loader ever throws notFound()/redirect() internally,
  //    re-introduce `unstable_rethrow(err)` as the first line of this catch.
  let result: TOutcome;
  try {
    result = await opts.load();
  } catch (err) {
    emit("render_failure", {
      latencyMs: Date.now() - startedAt,
      errorClass: err instanceof Error ? err.constructor.name : "unknown",
    });
    throw err;
  }

  // 5. Disposition — exhaustive over a gate-owned enum. Every notFound() here is OUTSIDE any try.
  const disposition = opts.classify(result);
  if (disposition === "forbidden") {
    emit("authz_deny");
    notFound();
  }
  if (disposition === "not-found") {
    notFound(); // silent (enumeration-safe); no metric
  }
  if (disposition === "passthrough") {
    return result; // empty / notApplicable → the page renders the panel
  }
  if (disposition !== "ok") {
    const _exhaustive: never = disposition;
    throw new Error(`unhandled report disposition: ${String(_exhaustive)}`);
  }

  // 6. OK → fail-closed audit BEFORE returning. auditSink.create is a DB write (never control-flow).
  try {
    const spec = opts.auditOf(result);
    await deps.auditSink.create({
      data: {
        entityType: spec.entityType,
        entityId: spec.entityId,
        action: spec.action,
        performedBy: opts.actor?.email ?? "anon",
        changes: JSON.stringify(spec.changes),
        ipAddress: opts.ip,
        userAgent: opts.userAgent,
      },
    });
  } catch (err) {
    const errorClass = err instanceof Error ? err.constructor.name : "unknown";
    const latencyMs = Date.now() - startedAt;
    emit("render_failure", { latencyMs, errorClass });
    emit("audit_failure", { ...(opts.auditFailureFields?.(result) ?? {}), errorClass });
    throw err;
  }

  // 7. OK outcome returned UNCHANGED. The PAGE emits `view` (+ surface signals) and renders.
  return result;
}
