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
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  hasComparableLongitudinal,
  asLongitudinalEligibilityDb,
} from "@/lib/assessments/longitudinal-eligibility";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";
import {
  buildPeerComparisonSection,
  isPeerRenderEnabledAlias,
  type PeerComparisonSection,
} from "@/lib/assessments/peer-benchmarks";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

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

  // Wave N (#23) — "View across campaigns" entry link. The link is rendered
  // ONLY when the longitudinal eligibility predicate is true: feature flag on,
  // scored template, current template access, AND ≥2 scored submissions for
  // this person on this template. Computed SERVER-side here (the gate already
  // authorized the report); the campaign carries the organizationId + templateId
  // the helper + URL need (the report payload only carries the alias). The
  // actor is re-resolved (cheap; the gate consumed it internally). Fail-soft:
  // any error / no actor / not-eligible ⇒ no link.
  const longitudinal = await resolveLongitudinalEntry(id, respondentId);

  // Wave S (Jeff #12/#13) — the optional "compared to peers" section. Gated on
  // the wave flag + render-enabled alias BEFORE any DB read (flag OFF ⇒ zero
  // benchmark queries, byte-identical page — spec 19s S-2). Fail-soft like the
  // longitudinal entry: any error ⇒ no section, never a broken report.
  const peerComparison = await resolvePeerComparison(id, report);

  return (
    <div className="su-report-page">
      <div className="su-report-actions no-print">
        <PrintReportButton />
        {longitudinal && (
          // prefetch is irrelevant for a plain <a>, but per spec the
          // longitudinal surface is NEVER prefetched: a plain anchor (not a
          // Next <Link>) guarantees no prefetch of the named-PII view.
          <a
            href={longitudinal.href}
            className="su-cta su-report-longitudinal-link"
            data-testid="respondent-report-longitudinal-link"
          >
            View across campaigns
          </a>
        )}
      </div>
      <BrandedReport
        report={report}
        campaignLabel={report.campaignLabel}
        peerComparison={peerComparison}
      />
    </div>
  );
}

/**
 * Resolve the Wave N "View across campaigns" entry for this report, or null
 * when ineligible. Loads the campaign's organizationId + templateId (+ template
 * alias) — the report payload carries only the alias, and the helper + URL need
 * the ids — re-resolves the actor, and runs `hasComparableLongitudinal`.
 * Fail-soft: a missing actor, a missing/soft-deleted campaign, or a thrown
 * helper all resolve to null (no link), never a crash on the report render.
 */
async function resolveLongitudinalEntry(
  campaignId: string,
  respondentId: string,
): Promise<{ href: string } | null> {
  try {
    const actor = await getApiActor();
    if (!actor) return null;

    const campaign = await db.assessmentCampaign.findFirst({
      where: { id: campaignId, deletedAt: null },
      select: {
        organizationId: true,
        templateId: true,
        template: { select: { alias: true } },
      },
    });
    if (!campaign) return null;

    const eligible = await hasComparableLongitudinal(
      asLongitudinalEligibilityDb(db),
      actor,
      {
        organizationId: campaign.organizationId,
        respondentId,
        templateId: campaign.templateId,
        templateAlias: campaign.template?.alias ?? null,
      },
    );
    if (!eligible) return null;

    const href =
      `/portal/assessments/respondents/${encodeURIComponent(respondentId)}/longitudinal` +
      `?templateId=${encodeURIComponent(campaign.templateId)}` +
      `&organizationId=${encodeURIComponent(campaign.organizationId)}`;
    return { href };
  } catch {
    // Never let the entry-link computation break the report render.
    return null;
  }
}

/**
 * Wave S — resolve the "compared to peers" section for this report, or null.
 * Flag + render-enabled-alias gates run FIRST (no DB touch when off); then the
 * campaign's templateId keys the AssessmentBenchmark rows and the PURE builder
 * derives the section from the frozen report payload (questionsByKey +
 * rawAnswers — the same inputs the qualitative renderer consumes). Fail-soft:
 * a missing campaign, zero rows, no qualifying factors, or a throw all resolve
 * to null (the report renders exactly as pre-Wave-S).
 */
async function resolvePeerComparison(
  campaignId: string,
  report: RespondentReport,
): Promise<PeerComparisonSection | null> {
  try {
    if (!isPeerBenchmarksEnabled()) return null;
    if (!isPeerRenderEnabledAlias(report.templateAlias ?? null)) return null;

    const campaign = await db.assessmentCampaign.findFirst({
      where: { id: campaignId, deletedAt: null },
      select: { templateId: true },
    });
    if (!campaign) return null;

    const rows = await db.assessmentBenchmark.findMany({
      where: { templateId: campaign.templateId, metricKind: "QUESTION" },
      select: { metricKey: true, value: true },
    });
    if (rows.length === 0) return null;

    return buildPeerComparisonSection({
      questionsByKey: report.questionsByKey,
      rawAnswers: report.rawAnswers,
      benchmarks: new Map(rows.map((r) => [r.metricKey, r.value])),
      templateAlias: report.templateAlias ?? null,
    });
  } catch {
    // Never let peer-comparison resolution break the report render.
    return null;
  }
}
