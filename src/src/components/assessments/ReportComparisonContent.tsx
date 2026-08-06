import type {
  ComparableValue,
  ReportComparisonModel,
} from "@/lib/assessments/report-comparison-model";

export interface ReportComparisonLabels {
  domains?: Record<string, string | undefined>;
  sections?: Record<string, string | undefined>;
  questions?: Record<string, string | undefined>;
}

function submittedDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function labelFor(labels: Record<string, string | undefined> | undefined, key: string): string {
  return labels?.[key]?.trim() || key;
}

function formatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function formatSigned(value: number): string {
  if (Object.is(value, -0) || value === 0) return "0";
  return value > 0 ? `+${value}` : String(value);
}

export function DeltaValue({ value }: { value: ComparableValue }) {
  if (value.delta === null) {
    const label = value.status === "different-version"
      ? "Different version"
      : "Not comparable";
    return (
      <span aria-label={label}>
        — <span className="su-report-comparison-delta-status" aria-hidden="true">{label}</span>
      </span>
    );
  }

  const direction = value.delta > 0 ? "increase" : value.delta < 0 ? "decrease" : "no change";
  const symbol = value.delta > 0 ? "▲" : value.delta < 0 ? "▼" : "•";
  return <span aria-label={`${direction} ${Math.abs(value.delta)}`}>{symbol} {formatSigned(value.delta)}</span>;
}

function ValueCell({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span aria-label="Not comparable">—</span>;
  }
  return <>{formatValue(value)}</>;
}

function ComparisonTable({
  title,
  rows,
  labels,
  questionRows = false,
}: {
  title: string;
  rows: Record<string, ComparableValue>;
  labels?: Record<string, string | undefined>;
  questionRows?: boolean;
}) {
  const entries = Object.entries(rows).filter(([, value]) => !questionRows || value.current !== null);
  if (entries.length === 0) return null;

  return (
    <section className="su-report-comparison-section" aria-labelledby={`report-comparison-${title.toLowerCase()}`}>
      <h3 id={`report-comparison-${title.toLowerCase()}`}>{title}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Current</th>
            <th scope="col">Previous</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr className="su-report-comparison-row" key={key}>
              <th scope="row">
                {labelFor(labels, key)}
                {questionRows && value.status === "unmatched" ? (
                  <span className="su-report-comparison-status">New or changed question</span>
                ) : null}
              </th>
              <td><ValueCell value={value.current} /></td>
              <td><ValueCell value={value.previous} /></td>
              <td><DeltaValue value={value} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ComparisonCoverSubtitle({ comparison }: { comparison?: ReportComparisonModel | null }) {
  if (!comparison) return null;
  const campaign = comparison.baseline.campaignLabel?.trim() || "Scaling Up Assessment";
  return (
    <p className="su-report-comparison-cover-subtitle" data-testid="report-comparison-cover-subtitle">
      Compared with {campaign} · submitted {submittedDate(comparison.baseline.submittedAt)}
    </p>
  );
}

export function ReportComparisonContent({
  comparison,
  labels,
}: {
  comparison?: ReportComparisonModel | null;
  labels?: ReportComparisonLabels;
}) {
  if (!comparison) return null;
  const { coverage } = comparison;
  const unmatched = coverage.unmatchedCurrentCount;
  const baselineOnly = coverage.baselineOnlyCount;

  return (
    <section className="su-report-comparison" data-testid="report-comparison-content" aria-labelledby="report-comparison-title">
      <div className="su-report-comparison-eyebrow">Current versus previous</div>
      <h2 id="report-comparison-title">Compared results</h2>
      <p className="su-report-comparison-coverage">
        {coverage.matchedQuestionCount} of {coverage.currentQuestionCount} current question{coverage.currentQuestionCount === 1 ? "" : "s"} matched the earlier version.
        {unmatched > 0 ? ` ${unmatched} new or changed question${unmatched === 1 ? "" : "s"} ${unmatched === 1 ? "has" : "have"} no comparison.` : ""}
        {baselineOnly > 0 ? ` ${baselineOnly} baseline-only question${baselineOnly === 1 ? " was" : "s were"} omitted.` : ""}
      </p>
      <section className="su-report-comparison-section" aria-labelledby="report-comparison-overall">
        <h3 id="report-comparison-overall">Overall result</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Current</th>
              <th scope="col">Previous</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr className="su-report-comparison-row">
              <th scope="row">ScaleUp score</th>
              <td><ValueCell value={comparison.overall.current} /></td>
              <td><ValueCell value={comparison.overall.previous} /></td>
              <td><DeltaValue value={comparison.overall} /></td>
            </tr>
          </tbody>
        </table>
      </section>
      <ComparisonTable title="Decisions" rows={comparison.domains} labels={labels?.domains} />
      <ComparisonTable title="Sections" rows={comparison.sections} labels={labels?.sections} />
      <ComparisonTable title="Questions" rows={comparison.questions} labels={labels?.questions} questionRows />
    </section>
  );
}
