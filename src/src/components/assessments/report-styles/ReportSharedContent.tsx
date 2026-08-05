import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";

export function ReportIdentityHeader({
  view,
  eyebrow,
}: {
  view: ScoredReportViewModel;
  eyebrow: string;
}) {
  return (
    <header>
      <p>{eyebrow}</p>
      <h1>{view.identity.assessmentName}</h1>
      {view.identity.campaignSubtitle ? <p>{view.identity.campaignSubtitle}</p> : null}
      <p>
        {view.identity.respondentName} · {view.identity.companyName} · {view.identity.submittedAtLabel}
      </p>
    </header>
  );
}

/** Shared semantic ledger: the two renderers differ in placement, never facts. */
export function DecisionLedger({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-labelledby="report-style-decisions-title">
      <h2 id="report-style-decisions-title">Five Decisions</h2>
      <p>Average across sections</p>
      <ol>
        {view.decisions.map((decision) => (
          <li key={decision.stableKey} data-testid={`report-style-decision-${decision.stableKey}`}>
            <strong>{decision.label}</strong>: {decision.averageAcrossSectionsLabel}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ScoreMatrix({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-labelledby="report-style-scorecard-title">
      <h2 id="report-style-scorecard-title">Score and action matrix</h2>
      <table>
        <thead>
          <tr><th>Decision</th><th>Score</th><th>Priority</th></tr>
        </thead>
        <tbody>
          {view.decisions.map((decision) => (
            <tr key={decision.stableKey}>
              <th scope="row">{decision.label}</th>
              <td>{decision.averageAcrossSectionsLabel}</td>
              <td>{view.insights.priorities.some((item) => item.stableKey === decision.stableKey) ? "Priority action" : "Maintain momentum"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Recommendations({ view }: { view: ScoredReportViewModel }) {
  if (view.recommendations.length === 0) return null;
  return (
    <section aria-labelledby="report-style-actions-title">
      <h2 id="report-style-actions-title">Prioritized board actions</h2>
      {view.recommendations.map((group) => (
        <div key={group.sectionStableKey ?? group.label}>
          <h3>{group.label}</h3>
          <ul>
            {group.items.map((item) => <li key={item.stableKey}>{item.text}</li>)}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function AdditionalResponses({ view }: { view: ScoredReportViewModel }) {
  if (view.additionalResponses.length === 0) return null;
  return (
    <section aria-labelledby="report-style-additional-title">
      <h2 id="report-style-additional-title">Additional responses</h2>
      <dl>
        {view.additionalResponses.map((response) => (
          <div key={response.label}><dt>{response.label}</dt><dd>{response.answer}</dd></div>
        ))}
      </dl>
    </section>
  );
}

export function ReportCta({ view }: { view: ScoredReportViewModel }) {
  return (
    <footer>
      <p>Confidential assessment report · {view.provenance.templateName}</p>
      <a href={view.cta.learnMoreHref}>Learn More →</a>
      {view.cta.eligible ? <a href={view.cta.href}>{view.cta.label}</a> : null}
    </footer>
  );
}
