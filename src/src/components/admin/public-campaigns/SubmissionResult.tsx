import type { PublicResultSummary } from "@/lib/assessments/public-referrals";
import {
  FOUR_DECISION_STYLES,
  fourDecisionDomains,
} from "@/lib/assessments/public-result-summary";

interface SubmissionResultProps {
  summary: PublicResultSummary;
}

export function SubmissionResult({ summary }: SubmissionResultProps) {
  if (summary.kind !== "scored") {
    return <span>{summary.label}</span>;
  }

  const decisions = fourDecisionDomains(summary);

  return (
    <div>
      <strong>{summary.overallScore.toFixed(1)}</strong>
      {summary.tierLabel && (
        <div className="wf-muted-text">{summary.tierLabel}</div>
      )}
      {decisions && (
        <div
          aria-label="Four Decisions result"
          className="mt-1 flex gap-1"
        >
          {decisions.map(({ key }) => (
            <span
              key={key}
              aria-hidden="true"
              data-testid="four-decisions-segment"
              className="block h-1 w-5 rounded-full"
              style={{ background: FOUR_DECISION_STYLES[key].color }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
