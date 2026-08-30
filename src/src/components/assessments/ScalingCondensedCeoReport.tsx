import { CoachLogo } from "@/components/assessments/CoachLogo";
import { SuFullVerticalPeerChart } from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
import { SuFullLandscapePage } from "@/components/assessments/su-full-landscape/SuFullLandscapePages";
import type { ScalingCondensedCeoSnapshot } from "@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

/** The approved canonical HTML renderer for the two-page Condensed report. */
export function ScalingCondensedCeoReport({
  snapshot,
  responsiveEnabled = false,
}: {
  snapshot: ScalingCondensedCeoSnapshot;
  responsiveEnabled?: boolean;
}) {
  const footerBrand = snapshot.provenance;

  return (
    <div
      className="su-public-brand su-report su-full-landscape su-condensed-ceo"
      data-responsive-report={responsiveEnabled ? "" : undefined}
      data-testid="scaling-condensed-ceo-report"
    >
      <div className="su-full-landscape-report">
        <SuFullLandscapePage number={1} variant="cover" footerBrand={footerBrand}>
          <div className="su-full-landscape-cover-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="su-full-landscape-cover-mark"
              src="/brand/su-logo-white.svg"
              alt="Scaling Up"
              width={180}
              height={24}
            />
            <CoachLogo
              url={snapshot.provenance.coachLogoUrl}
              name={snapshot.provenance.coachName}
              variant="cover"
            />
          </div>
          <div className="su-full-landscape-cover-title su-condensed-ceo-cover-title">
            <p>Scaling Up Assessment</p>
            <h1>Your Scaling Up Report</h1>
            <p className="su-condensed-ceo-cover-edition">Condensed version</p>
          </div>
          <div className="su-full-landscape-cover-meta">
            <p className="su-full-landscape-cover-for">
              Report for: {snapshot.source.respondentName}
            </p>
            <p>{snapshot.destination.companyName}</p>
            <p className="su-full-landscape-cover-sub">
              {snapshot.destination.campaignName} · {formatDate(snapshot.source.submittedAt)}
            </p>
          </div>
        </SuFullLandscapePage>

        <SuFullLandscapePage number={2} variant="appendix" footerBrand={footerBrand}>
          <h2>Appendix A: chapter comparisons</h2>
          {snapshot.model.groups.map((group) => (
            <SuFullVerticalPeerChart
              chapterKey={group.key}
              key={group.key}
              questions={group.questions}
              instanceId={`condensed-${group.key}`}
              title={`${group.label} comparison`}
            />
          ))}
        </SuFullLandscapePage>
      </div>
    </div>
  );
}
