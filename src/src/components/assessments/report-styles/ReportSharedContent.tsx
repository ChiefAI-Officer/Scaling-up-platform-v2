import { CoachLogo } from "@/components/assessments/CoachLogo";
import type {
  AdditionalResponseBlock,
  ClosingBlock,
  CoachCtaBlock,
  FindingBlock,
  IndividualReportBlock,
  IndividualReportPresentation,
  MetricGroupBlock,
  NarrativeResponseBlock,
  QualitativeScaleBlock,
  RecommendationBlock,
  ReportMetric,
  ScoreSummaryBlock,
  ThemeBlock,
} from "@/lib/assessments/individual-report-presentation";

export function ReportIdentityHeader({
  presentation,
  eyebrow,
}: {
  presentation: IndividualReportPresentation;
  eyebrow: string;
}) {
  const { identity } = presentation;
  return (
    <header>
      <p>{eyebrow}</p>
      <h1>{identity.assessmentName}</h1>
      {identity.campaignSubtitle ? <p>{identity.campaignSubtitle}</p> : null}
      <p>
        {identity.respondentName}
        {identity.jobTitle ? ` · ${identity.jobTitle}` : ""}
        {` · ${identity.companyName} · ${identity.submittedAtLabel}`}
      </p>
      {identity.respondentEmail && !identity.respondentNameIsEmail ? (
        <p>{identity.respondentEmail}</p>
      ) : null}
    </header>
  );
}

export function ReportProvenance({
  presentation,
}: {
  presentation: IndividualReportPresentation;
}) {
  return (
    <p className="report-provenance" data-testid="report-style-provenance">
      Confidential assessment report · {presentation.provenance.templateName} ·
      submission {presentation.provenance.submissionId ?? "unavailable"} ·
      version {presentation.provenance.versionId ?? "unavailable"} · hash{" "}
      {presentation.provenance.contentHash ?? "unavailable"}
      {presentation.provenance.imported ? " · imported" : ""}
    </p>
  );
}

function ScoreSummary({ block }: { block: ScoreSummaryBlock }) {
  return (
    <section data-report-block="score-summary">
      <p>{block.headlineLabel}</p>
      <h2>{block.headline}</h2>
      {block.showTier && block.tierMessage ? <p>{block.tierMessage}</p> : null}
      <dl>
        <div>
          <dt>Total points</dt>
          <dd>{block.overallTotalLabel}</dd>
        </div>
        <div>
          <dt>Average per item</dt>
          <dd>{block.overallAverageLabel}</dd>
        </div>
        <div>
          <dt>Answered items</dt>
          <dd>{block.answeredItems}</dd>
        </div>
        <div>
          <dt>Sections</dt>
          <dd>{block.sectionCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function MetricValue({ metric }: { metric: ReportMetric }) {
  return (
    <div
      className="report-metric"
      data-achievement-status={
        metric.achievementMarker?.label.replace(" ", "-") ?? undefined
      }
      data-testid={`report-style-question-${metric.stableKey}`}
    >
      <dt>{metric.label}{metric.unmapped ? " (unmapped)" : ""}</dt>
      <dd>{metric.valueLabel}</dd>
      {metric.achievementMarker ? (
        <dd className="report-achievement">
          <span aria-hidden="true">{metric.achievementMarker.symbol}</span>{" "}
          {metric.achievementMarker.label}
        </dd>
      ) : null}
      {typeof metric.min === "number" && typeof metric.max === "number" ? (
        <dd className="report-range">
          <span>Range</span> {metric.min}–{metric.max}
        </dd>
      ) : null}
    </div>
  );
}

function MetricGroup({ block }: { block: MetricGroupBlock }) {
  return (
    <section
      data-report-block="metric-group"
      data-report-role={block.role}
      data-testid={`report-style-group-${block.stableKey}`}
    >
      <h2>{block.label}</h2>
      {block.description ? <p>{block.description}</p> : null}
      {block.summary ? (
        <dl className="report-group-summary">
          <div>
            <dt>Total</dt>
            <dd>{block.summary.totalLabel}</dd>
          </div>
          <div>
            <dt>Average</dt>
            <dd>{block.summary.averageLabel}</dd>
          </div>
          {typeof block.summary.achievedCount === "number" &&
          typeof block.summary.totalCount === "number" ? (
            <div>
              <dt>Achieved</dt>
              <dd>
                {block.summary.achievedCount} of {block.summary.totalCount}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {block.metrics.length > 0 ? (
        <dl className="report-metrics">
          {block.metrics.map((metric) => (
            <MetricValue key={metric.stableKey} metric={metric} />
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function QualitativeScale({ block }: { block: QualitativeScaleBlock }) {
  return (
    <section
      data-report-block="qualitative-scale"
      data-testid={`report-style-scale-${block.stableKey}`}
    >
      <h2>{block.label}</h2>
      {block.description ? <p>{block.description}</p> : null}
      <dl className="report-metrics">
        {block.items.map((item) => (
          <MetricValue key={item.stableKey} metric={item} />
        ))}
      </dl>
    </section>
  );
}

function Theme({ block }: { block: ThemeBlock }) {
  return (
    <section
      data-report-block="theme"
      data-testid={`report-style-theme-${block.stableKey}`}
    >
      <h2>{block.label}</h2>
      {block.description ? <p>{block.description}</p> : null}
      <dl className="report-metrics">
        {block.items.map((item) => (
          <MetricValue key={item.stableKey} metric={item} />
        ))}
      </dl>
    </section>
  );
}

function Finding({ block }: { block: FindingBlock }) {
  return (
    <section data-report-block="finding">
      <p>{block.eyebrow}</p>
      <h2>{block.label}</h2>
      {block.groups.map((group, groupIndex) => (
        <div
          className="report-finding-group"
          key={`${group.sectionName ?? "unsectioned"}-${groupIndex}`}
        >
          {group.sectionName ? <h3>{group.sectionName}</h3> : null}
          <ul>
            {group.items.map((item) => (
              <li key={item.stableKey}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Recommendation({ block }: { block: RecommendationBlock }) {
  return (
    <section data-report-block="recommendation">
      {block.groups.map((group, groupIndex) => (
        <div
          className="report-action-group"
          key={`${group.sectionStableKey ?? "unsectioned"}-${groupIndex}`}
        >
          <h2>{group.label}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.stableKey}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function NarrativeResponse({
  block,
}: {
  block: NarrativeResponseBlock;
}) {
  return (
    <section
      data-report-block="narrative-response"
      data-testid={`report-style-narrative-${block.stableKey}`}
    >
      <h2>{block.label}</h2>
      {block.description ? <p>{block.description}</p> : null}
      <dl className="report-responses">
        {block.responses.map((response) => (
          <div key={response.stableKey}>
            <dt>{response.label}</dt>
            <dd>{response.answer}</dd>
            {typeof response.min === "number" &&
            typeof response.max === "number" ? (
              <dd className="report-range">
                <span>Range</span> {response.min}–{response.max}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

function AdditionalResponse({ block }: { block: AdditionalResponseBlock }) {
  return (
    <section data-report-block="additional-response">
      <dl className="report-responses">
        {block.responses.map((response) => (
          <div key={response.stableKey}>
            <dt>{response.label}</dt>
            <dd>{response.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CoachCta({ block }: { block: CoachCtaBlock }) {
  return (
    <nav aria-label="Report actions" data-report-block="coach-cta">
      <a href={block.learnMoreHref}>Learn More →</a>
      <a href={block.href}>{block.label}</a>
    </nav>
  );
}

function Closing({ block }: { block: ClosingBlock }) {
  return (
    <footer data-report-block="closing">
      <h2>Keep Scaling, {block.greeting}.</h2>
      <CoachLogo
        url={block.coach.logoUrl}
        name={block.coach.name}
        variant="footer"
      />
    </footer>
  );
}

function unreachableBlock(block: never): never {
  throw new Error(
    `Unsupported individual report block: ${String(
      (block as { kind?: unknown }).kind,
    )}`,
  );
}

function ReportBlock({ block }: { block: IndividualReportBlock }) {
  switch (block.kind) {
    case "score-summary":
      return <ScoreSummary block={block} />;
    case "metric-group":
      return <MetricGroup block={block} />;
    case "qualitative-scale":
      return <QualitativeScale block={block} />;
    case "theme":
      return <Theme block={block} />;
    case "finding":
      return <Finding block={block} />;
    case "recommendation":
      return <Recommendation block={block} />;
    case "narrative-response":
      return <NarrativeResponse block={block} />;
    case "additional-response":
      return <AdditionalResponse block={block} />;
    case "coach-cta":
      return <CoachCta block={block} />;
    case "closing":
      return <Closing block={block} />;
    default:
      return unreachableBlock(block);
  }
}

export function ReportBlocks({
  blocks,
}: {
  blocks: readonly IndividualReportBlock[];
}) {
  return blocks.map((block, index) => (
    <ReportBlock key={`${block.kind}-${index}`} block={block} />
  ));
}

export function partitionReportBlocks(
  blocks: readonly IndividualReportBlock[],
): {
  summary: IndividualReportBlock[];
  detail: IndividualReportBlock[];
} {
  const summary: IndividualReportBlock[] = [];
  const detail: IndividualReportBlock[] = [];

  for (const block of blocks) {
    if (
      block.kind === "score-summary" ||
      (block.kind === "metric-group" && block.role === "domain")
    ) {
      summary.push(block);
    } else {
      detail.push(block);
    }
  }

  return { summary, detail };
}
