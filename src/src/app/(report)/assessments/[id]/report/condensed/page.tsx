import { notFound } from "next/navigation";

import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { ScalingCondensedCeoReport } from "@/components/assessments/ScalingCondensedCeoReport";
import { defaultReportGateDeps } from "@/lib/assessments/report-access-gate-deps";
import { viewCondensedCeoReport } from "@/lib/assessments/condensed-ceo-report-access-gate";
import { emitGroupReportMetric } from "@/lib/assessments/group-report-metrics";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string }>;
}

const UNAVAILABLE_COPY = {
  "no-ceo": {
    title: "No CEO is designated for this campaign",
    body: "Designate the CEO in the campaign before opening the Condensed report.",
  },
  "ceo-not-submitted": {
    title: "The CEO has not submitted this assessment",
    body: "The Condensed report becomes available after the designated CEO submits.",
  },
  "source-incomplete": {
    title: "The CEO report is incomplete",
    body: "The stored result does not contain all 61 validated scores and peer comparisons.",
  },
} as const;

const NOT_APPLICABLE_COPY = {
  public: "Condensed reports are available for invited campaigns only.",
  "unsupported-template": "This campaign does not use the Scaling Up Full assessment.",
  unpublished: "This assessment version must be published before its Condensed report is available.",
} as const;

export default async function CondensedCeoReportPage({ params }: PageProps) {
  const { id: campaignId } = await params;
  const responsiveEnabled = isMobileResponsiveEnabled();
  const generatedAt = new Date();
  const { outcome, metricRole } = await viewCondensedCeoReport(
    defaultReportGateDeps(),
    { campaignId, generatedAt },
  );

  if (outcome.kind === "not-applicable") {
    emitGroupReportMetric("not_applicable", {
      role: metricRole,
      reportType: "condensed-ceo",
      template: "scaling-up-full",
      reason: outcome.reason,
    });
    return (
      <div className="su-report-page" data-responsive-report-page={responsiveEnabled ? "" : undefined}>
        <div className="su-group-empty" data-testid="condensed-report-not-applicable">
          <p className="su-group-empty-title">Condensed report is not available</p>
          <p className="su-group-empty-sub">{NOT_APPLICABLE_COPY[outcome.reason]}</p>
        </div>
      </div>
    );
  }

  if (outcome.kind === "unavailable") {
    const copy = UNAVAILABLE_COPY[outcome.reason];
    return (
      <div className="su-report-page" data-responsive-report-page={responsiveEnabled ? "" : undefined}>
        <div className="su-group-empty" data-testid={`condensed-report-${outcome.reason}`}>
          <p className="su-group-empty-title">{copy.title}</p>
          <p className="su-group-empty-sub">{copy.body}</p>
        </div>
      </div>
    );
  }

  if (outcome.kind !== "ok") notFound();

  const { snapshot } = outcome;
  emitGroupReportMetric("view", {
    role: metricRole,
    reportType: "condensed-ceo",
    template: "scaling-up-full",
    completedCount: 1,
  });

  return (
    <div className="su-report-page" data-responsive-report-page={responsiveEnabled ? "" : undefined}>
      <div className="su-report-actions no-print">
        <PrintReportButton
          fileName={`${snapshot.destination.companyName} - ${snapshot.destination.assessmentName} - Condensed CEO Report`}
        />
      </div>
      <ScalingCondensedCeoReport
        snapshot={snapshot}
        responsiveEnabled={responsiveEnabled}
      />
    </div>
  );
}
