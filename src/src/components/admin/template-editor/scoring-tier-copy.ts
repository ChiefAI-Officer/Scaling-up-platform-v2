import type { TierTilingIssue } from "@/lib/assessments/scoring";

export const FRIENDLY_SCORING_COPY = {
  title: "How results are calculated",
  metricLabel: "Overall result is based on",
  passThresholdLabel: "A question passes at",
  overallTiers: "Overall result tiers",
  areaTiers: "Results by area",
  exampleResult: "Example result",
  publishHelp: "Before you can publish",
  startsAt: "Starts at",
  endsAt: "Ends at",
  resultName: "Result name",
  messageShown: "Message shown",
  noMaximum: "No maximum",
  addTier: "Add tier",
} as const;

const METRIC_LABELS = {
  countAchieved: "Questions passed",
  overallTotal: "Sum of all answers",
  overallAvg: "Average across all questions",
} as const;

export type TierMetricKey = keyof typeof METRIC_LABELS;

export function friendlyMetricLabel(metric: TierMetricKey): string {
  return METRIC_LABELS[metric];
}

function detailString(details: Record<string, unknown>, key: string): string {
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function detailNumber(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === "number" ? value : null;
}

export function formatFriendlyTilingIssue(
  issue: TierTilingIssue,
  surfaceLabel: string,
): string {
  if (issue.code === "EMPTY_TIERS") {
    return `${surfaceLabel}: add at least one tier.`;
  }
  if (issue.code === "FIRST_RANGE_START") {
    return `${surfaceLabel}: the first range must start at ${detailNumber(
      issue.details,
      "domainMin",
    )}.`;
  }
  if (issue.code === "EARLY_NO_MAXIMUM") {
    const label = detailString(issue.details, "tierLabel");
    return `${surfaceLabel}: "${label}" can have no maximum only when it is the last range.`;
  }
  if (issue.code === "RANGE_GAP") {
    return `${surfaceLabel}: "${detailString(
      issue.details,
      "tierA",
    )}" ends at ${detailNumber(
      issue.details,
      "aMax",
    )}; "${detailString(
      issue.details,
      "tierB",
    )}" must start at ${detailNumber(issue.details, "expectedNextMin")}.`;
  }
  if (issue.code === "RANGE_OVERLAP") {
    return `${surfaceLabel}: "${detailString(
      issue.details,
      "tierA",
    )}" ends at ${detailNumber(
      issue.details,
      "aMax",
    )}; "${detailString(
      issue.details,
      "tierB",
    )}" starts at ${detailNumber(issue.details, "bMin")}.`;
  }
  if (issue.code === "LAST_RANGE_END") {
    return `${surfaceLabel}: the last range must end at ${detailNumber(
      issue.details,
      "domainMax",
    )} or have no maximum.`;
  }
  return `${surfaceLabel}: adjust the ranges so they cover every possible result.`;
}
