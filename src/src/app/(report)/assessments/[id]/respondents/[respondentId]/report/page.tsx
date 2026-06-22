/**
 * Assessment v7.6 — coach/admin-gated per-respondent results report PAGE.
 *
 * Server component. URL: /assessments/[id]/respondents/[respondentId]/report
 * (sibling to (portal); renders the brand-scoped report WITHOUT portal chrome —
 * see (report)/layout.tsx).
 *
 * The cross-cutting protocol — actor resolution (+ redirect-login on no actor),
 * the fail-closed rate-limit guard, the authorized load (canManageCampaign
 * inside getRespondentReport — ADMIN/STAFF bypass + owning coach), forbidden /
 * not-found → enumeration-safe 404, and the fail-closed VIEW_REPORT audit (now
 * with IP/UA) — lives in the Report access gate (viewRespondentReport → the pure
 * report-gate-core). See ADR-0012. This page keeps only the OK render + the
 * page-owned `view` metric.
 *
 * H15 (cache/PII): dynamic = "force-dynamic" + revalidate = 0 keep the page out
 *   of any static/edge cache; the real `Cache-Control` header is layered in
 *   middleware.
 */

import { notFound } from "next/navigation";
import {
  viewRespondentReport,
  defaultReportGateDeps,
} from "@/lib/assessments/report-access-gate";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { emitReportMetric } from "@/lib/assessments/report-metrics";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";

// H15: never statically render or cache the report (PII).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string; respondentId: string }>;
}

export default async function RespondentReportPage({ params }: PageProps) {
  const { id, respondentId } = await params;

  const { outcome, metricRole } = await viewRespondentReport(defaultReportGateDeps(), {
    campaignId: id,
    respondentId,
  });

  // forbidden / not-found already 404'd inside the gate; this narrows the type.
  if (outcome.status !== "ok") {
    notFound();
  }

  const { report } = outcome;

  // Page-owned success marker (the gate emits only the request-ending events).
  emitReportMetric("respondent", "view", {
    role: metricRole,
    template: report.templateAlias ?? null,
    reportType: reportConfigFor(report.templateAlias).reportType,
  });

  return (
    <div className="su-report-page">
      <div className="su-report-actions no-print">
        <PrintReportButton />
      </div>
      <BrandedReport report={report} campaignLabel={report.campaignLabel} />
    </div>
  );
}
