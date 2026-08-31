import type { PublicResultAction } from "@/lib/assessments/report-config";
import { TALK_TO_A_COACH_URL } from "@/lib/assessments/talk-to-a-coach";

interface ReportNextStepsProps {
  contactEmail?: string | null;
  showCoachLink?: boolean;
  publicResultActions?: readonly PublicResultAction[];
}

export function ReportNextSteps({
  contactEmail,
  showCoachLink = true,
  publicResultActions,
}: ReportNextStepsProps) {
  const email = contactEmail?.trim() ?? "";
  const coachHref =
    email === ""
      ? TALK_TO_A_COACH_URL
      : `mailto:${encodeURIComponent(email)}`;

  return (
    <div className="su-report-next-steps" data-testid="report-next-steps">
      {publicResultActions && publicResultActions.length > 0 ? (
        publicResultActions.map((action, index) => (
          <a
            className={`su-report-cta${index === 0 ? " su-report-cta-secondary" : ""}`}
            href={action.href}
            key={action.href}
          >
            {action.label}
          </a>
        ))
      ) : (
        <>
          <a
            className="su-report-cta su-report-cta-secondary"
            href="https://scalingup.com"
          >
            Learn More →
          </a>
          {showCoachLink ? (
            <a className="su-report-cta" href={coachHref}>
              Talk to a Coach →
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}

export default ReportNextSteps;
