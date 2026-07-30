interface ReportNextStepsProps {
  contactEmail?: string | null;
  showCoachLink?: boolean;
}

const COACH_DIRECTORY_URL = "https://scalingup.com/coaches";

export function ReportNextSteps({
  contactEmail,
  showCoachLink = true,
}: ReportNextStepsProps) {
  const email = contactEmail?.trim() ?? "";
  const coachHref =
    email === ""
      ? COACH_DIRECTORY_URL
      : `mailto:${encodeURIComponent(email)}`;

  return (
    <div className="su-report-next-steps" data-testid="report-next-steps">
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
    </div>
  );
}

export default ReportNextSteps;
