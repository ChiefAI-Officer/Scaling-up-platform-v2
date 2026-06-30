/**
 * Assessment v7.6 — Wave N (#23) — per-respondent longitudinal PAGE.
 *
 * Server component. URL:
 *   /portal/assessments/respondents/[respondentId]/longitudinal
 *     ?templateId=…&organizationId=…
 *
 * Coach-portal page (BLUE app chrome, NOT the brand-scoped report). Tracks ONE
 * person's results across the campaigns they completed for the SAME scored
 * assessment. The single-person counterpart to the cohort trends page; mirrors
 * its `requireCoach` + searchParam-parsing + server-render posture, plus:
 *
 *   - FLAG GATE (R3-High-1): `isRespondentLongitudinalEnabled({org, template})`
 *     → `notFound()` (404) when off. Merge-dark default.
 *   - DUAL AUTHZ (R2-High-2): `getRespondentLongitudinal` runs BOTH
 *     `canAccessOrganization` AND `canAccessTemplate`; `forbidden` → 404
 *     (anti-probing, no org/template-id enumeration). It also org-binds the
 *     entry respondent and scope-gates qualitative templates.
 *   - LIGHTWEIGHT AUDIT (R1-Med-6, GM-2): exactly one fail-SAFE
 *     `RESPONDENT_LONGITUDINAL_VIEW` on a successful (`ok`) render — actor / org
 *     / template / respondentId / matched-respondent-count / submission-count.
 *     NEVER raw emails. Audit failure must not break the render (this surface is
 *     trends-parity, not the heavier report-access-gate — no rate-limiter).
 *   - METRICS (R3-Med-1): PII-free `assessment.respondent_longitudinal.*`.
 *   - `Cache-Control: no-store, private` + `Referrer-Policy: no-referrer`
 *     (R3-Low-1) via the metadata export (org-survey precedent) — named
 *     single-person PII must not be cached.
 *
 * `unstable_rethrow` wraps the load/audit/metrics try so a `notFound()` (Next 16
 * digest `NEXT_HTTP_ERROR_FALLBACK;404`) thrown for the forbidden mapping is
 * never swallowed by the catch (the swallowed-404 class of bug from ADR-0012).
 */

import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { normalizeRole } from "@/lib/auth/access-control";
import type { ApiActor } from "@/lib/auth/access-control";
import { isRespondentLongitudinalEnabled } from "@/lib/assessments/wave-n-flags";
import {
  getRespondentLongitudinal,
  asRespondentLongitudinalDb,
} from "@/lib/assessments/respondent-longitudinal";
import { emitRespondentLongitudinalMetric } from "@/lib/assessments/respondent-longitudinal-metrics";
import { RespondentLongitudinalView } from "@/components/assessments/RespondentLongitudinalView";

// Named single-person PII — never statically render or cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// R3-Low-1: no-store + no-referrer on the page (org-survey precedent — these
// render as the corresponding <meta> tags; force-dynamic above keeps the page
// out of any static/edge cache).
export const metadata: Metadata = {
  title: "Assessment Comparison",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  other: {
    "Cache-Control": "no-store, private",
  },
};

interface PageProps {
  params: Promise<{ respondentId: string }>;
  searchParams: Promise<{ templateId?: string; organizationId?: string }>;
}

export default async function RespondentLongitudinalPage({
  params,
  searchParams,
}: PageProps) {
  // Coach-only entry (R1-Low-1, trends parity). requireCoach() may redirect —
  // that throws BEFORE the load try, so it is never swallowed.
  const { coach, session } = await requireCoach();

  const { respondentId } = await params;
  const sp = await searchParams;
  const templateId = sp.templateId;
  const organizationId = sp.organizationId;

  // Missing required scope → 404 (anti-probing; never reveal which is missing).
  if (!templateId || !organizationId) {
    notFound();
  }

  // FLAG GATE — merge-dark default-OFF. Off → 404 (route unreachable).
  if (!isRespondentLongitudinalEnabled({ organizationId, templateId })) {
    notFound();
  }

  const actor: ApiActor = {
    userId: session.user.id,
    email: session.user.email ?? "",
    role: normalizeRole(session.user.role ?? "COACH"),
    coachId: coach.id,
  };

  // Server component — one wall-clock latency stamp at the request boundary.
  // eslint-disable-next-line react-hooks/purity
  const startedAt = Date.now();

  try {
    const outcome = await getRespondentLongitudinal(
      asRespondentLongitudinalDb(db),
      actor,
      organizationId,
      respondentId,
      templateId,
    );

    // forbidden → enumeration-safe 404. Emit a PII-free authz_deny marker.
    if (outcome.kind === "forbidden") {
      emitRespondentLongitudinalMetric("authz_deny", { role: actor.role });
      notFound();
    }

    if (outcome.kind === "notApplicable") {
      emitRespondentLongitudinalMetric("not_applicable", {
        role: actor.role,
        reason: outcome.reason,
      });
      return <RespondentLongitudinalView outcome={outcome} />;
    }

    if (outcome.kind === "empty") {
      emitRespondentLongitudinalMetric("empty", { role: actor.role });
      return <RespondentLongitudinalView outcome={outcome} />;
    }

    // ok — write the lightweight, fail-SAFE audit (NO raw emails) then render.
    const { data } = outcome;

    // Fail-SAFE (not fail-closed): this is trends-parity named PII, not the
    // bulk-PII report-access-gate. An audit failure must NOT block the coach's
    // view of their own org's person. logAudit already swallows; we double-guard.
    try {
      await db.auditLog.create({
        data: {
          entityType: "OrgRespondent",
          entityId: respondentId,
          action: "RESPONDENT_LONGITUDINAL_VIEW",
          performedBy: actor.email || actor.userId,
          changes: JSON.stringify({
            organizationId,
            templateId,
            templateAlias: data.assessment.alias,
            matchedRespondentCount: data.matchedRespondentCount,
            submissionCount: data.submissionCount,
          }),
        },
      });
    } catch (auditErr) {
      // Never surface an audit write failure to the request path.
      console.error(
        "Failed to write RESPONDENT_LONGITUDINAL_VIEW audit:",
        auditErr,
      );
    }

    const degraded = data.points.some((p) => p.degraded === true);
    emitRespondentLongitudinalMetric("view", {
      role: actor.role,
      template: data.assessment.alias,
      reportType: "scored",
      matchedRespondentCount: data.matchedRespondentCount,
      submissionCount: data.submissionCount,
      comparableCount: data.comparableCount,
      degraded,
      bounded: data.bounded !== undefined,
      // eslint-disable-next-line react-hooks/purity
      latencyMs: Date.now() - startedAt,
    });
    if (degraded) {
      emitRespondentLongitudinalMetric("degraded", {
        role: actor.role,
        template: data.assessment.alias,
        submissionCount: data.submissionCount,
      });
    }

    return <RespondentLongitudinalView outcome={outcome} />;
  } catch (err) {
    // CRITICAL: let notFound()/redirect() control-flow errors propagate (Next 16
    // digest NEXT_HTTP_ERROR_FALLBACK;404) — never swallow them (ADR-0012).
    unstable_rethrow(err);
    // Genuine error → PII-free render_failure marker, then a clean 404 (the
    // surface stays enumeration-safe and never 500s on a load fault).
    emitRespondentLongitudinalMetric("render_failure", {
      role: actor.role,
      errorClass: err instanceof Error ? err.constructor.name : "Unknown",
    });
    notFound();
  }
}
