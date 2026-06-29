/**
 * Assessment v7.6 Wave F #22 — coach/admin-gated campaign GROUP report PAGE.
 *
 * Server component. URL: /assessments/[id]/report
 * (sibling to the per-respondent report; same (report) brand-scoped route group,
 * so it renders WITHOUT any portal sidebar/nav — see (report)/layout.tsx.)
 *
 * The cross-cutting request protocol — actor resolution, the default-OFF flag
 * gate, the fail-closed rate-limit guard, the authorized load, forbidden→404
 * (+ authz_deny), and the fail-closed GROUP_REPORT_VIEW audit — now lives in the
 * Report access gate (lib/assessments/report-access-gate.ts → viewGroupReport,
 * over the pure report-gate-core). See ADR-0012. This page keeps only what it
 * RENDERS — the notApplicable / empty panels and the OK group report — plus the
 * success-render metrics (not_applicable / empty / degraded / orphan_submission /
 * view). The gate emits the request-ending events (rate_limited / authz_deny /
 * render_failure / audit_failure).
 *
 * H15 (cache/PII): dynamic = "force-dynamic" + revalidate = 0 keep the page out
 *   of any static/edge cache. The real `Cache-Control: private, no-store`
 *   response header is layered in middleware.
 */

import { notFound } from "next/navigation";
import {
  viewGroupReport,
  defaultReportGateDeps,
} from "@/lib/assessments/report-access-gate";
import { emitGroupReportMetric } from "@/lib/assessments/group-report-metrics";
import {
  GroupReport,
  GroupReportEmpty,
} from "@/components/assessments/GroupReport";

// H15: never statically render or cache the report (bulk PII).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignGroupReportPage({ params }: PageProps) {
  const { id: campaignId } = await params;
  // Server component — renders once per request; a wall-clock latency stamp is
  // intentional and safe (the react-hooks/purity rule targets client components).
  // eslint-disable-next-line react-hooks/purity
  const startedAt = Date.now();
  // generatedAt is created at the boundary; the gate + loader stay clock-free.
  const generatedAt = new Date();

  const { outcome, metricRole } = await viewGroupReport(defaultReportGateDeps(), {
    campaignId,
    generatedAt,
  });

  // notApplicable → a clean informative panel. No audit (gate). The copy is
  // reason-aware: Wave J (J-3) adds `unpublished` (a DRAFT SU-Full version),
  // which must read accurately and NOT claim the campaign is public.
  if (outcome.kind === "notApplicable") {
    // Task 7 (Wave J): emit reason + template so not_applicable outcomes are
    // distinguishable in log-drain queries (unpublished vs unsupported-template
    // vs public-campaign — all low-cardinality, PII-free).
    emitGroupReportMetric("not_applicable", {
      role: metricRole,
      reason: outcome.reason,
      template: outcome.templateAlias,
    });
    const isUnpublished = outcome.reason === "unpublished";
    const isUnsupported = outcome.reason === "unsupported-template";
    const title = isUnpublished
      ? "Group report is not available yet"
      : isUnsupported
        ? "Group report is not available for this assessment type"
        : "Group report is available for invited campaigns only";
    const subtitle = isUnpublished
      ? "This assessment's content has not been published yet. The team group report becomes available once an administrator publishes the assessment version."
      : isUnsupported
        ? "The team group report is not supported for this assessment template."
        : "This is a public campaign. The team group report aggregates the answers of invited participants, so it does not apply here.";
    return (
      <div className="su-report-page">
        <div className="su-group-empty" data-testid="group-report-not-applicable">
          <p className="su-group-empty-title">{title}</p>
          <p className="su-group-empty-sub">{subtitle}</p>
        </div>
      </div>
    );
  }

  // empty (zero completions) → branded empty-state panel.
  if (outcome.kind === "empty") {
    emitGroupReportMetric("empty", {
      role: metricRole,
      invitedCount: outcome.provenance.invitedCount,
      completedCount: 0,
    });
    return (
      <div className="su-report-page">
        <GroupReportEmpty />
      </div>
    );
  }

  // forbidden — already 404'd inside the gate; this is defensive type-narrowing.
  if (outcome.kind !== "ok") {
    notFound();
  }

  const { report, provenance } = outcome;

  // R3-M1 — degraded / orphan signals derived from the assembled model (no PII;
  // counts only). degraded = >=1 dropped answer; orphanCount = cohort members
  // whose submission has no matching participant row.
  const orphanCount = report.respondents.filter((r) => r.isOrphan).length;
  if (report.degraded) {
    emitGroupReportMetric("degraded", {
      role: metricRole,
      template: provenance.templateAlias,
      reportType: report.reportType,
      degraded: true,
      completedCount: provenance.completedCount,
    });
  }
  if (orphanCount > 0) {
    emitGroupReportMetric("orphan_submission", {
      role: metricRole,
      template: provenance.templateAlias,
      orphanCount,
      completedCount: provenance.completedCount,
    });
  }

  // The OK render marker, with wall-clock render latency.
  // Task 7 (Wave J): also carry benchmark provenance (SU-Full only; null/undefined for LVA).
  emitGroupReportMetric("view", {
    role: metricRole,
    template: provenance.templateAlias,
    reportType: report.reportType,
    completedCount: provenance.completedCount,
    invitedCount: provenance.invitedCount,
    orphanCount,
    degraded: report.degraded,
    benchmarkVersion: provenance.benchmarkVersion ?? null,
    benchmarkKeyMismatch: provenance.benchmarkKeyMismatch ?? false,
    // eslint-disable-next-line react-hooks/purity
    latencyMs: Date.now() - startedAt,
  });

  // CEO display name from the model's CEO respondent (the loader/model own the
  // name snapshot — no extra DB hit).
  const ceoName = report.respondents.find((r) => r.isCEO)?.name ?? null;

  return (
    <div className="su-report-page">
      <GroupReport
        report={report}
        assessmentName={provenance.assessmentName}
        companyName={provenance.companyName}
        generatedAt={provenance.generatedAt}
        completedCount={provenance.completedCount}
        invitedCount={provenance.invitedCount}
        versionLabel={provenance.versionLabel}
        ceoName={ceoName}
        templateAlias={provenance.templateAlias}
      />
    </div>
  );
}
