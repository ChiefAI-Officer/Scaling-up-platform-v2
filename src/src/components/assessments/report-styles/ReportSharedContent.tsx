import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import { CoachLogo } from "@/components/assessments/CoachLogo";

type PerformanceStatus = "strength" | "on-track" | "watch-area" | "priority" | "unrated";

function performanceStatus(score: number | null): { key: PerformanceStatus; label: string } {
  if (score === null) return { key: "unrated", label: "Not rated" };
  if (score >= 8) return { key: "strength", label: "Strength" };
  if (score >= 6) return { key: "on-track", label: "On track" };
  if (score >= 4) return { key: "watch-area", label: "Watch area" };
  return { key: "priority", label: "Priority" };
}

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
        {view.identity.respondentName}
        {view.identity.jobTitle ? ` · ${view.identity.jobTitle}` : ""}
        {` · ${view.identity.companyName} · ${view.identity.submittedAtLabel}`}
      </p>
      {view.identity.respondentEmail && !view.identity.respondentNameIsEmail ? (
        <p>{view.identity.respondentEmail}</p>
      ) : null}
    </header>
  );
}

export function DegradedNotice({ view }: { view: ScoredReportViewModel }) {
  return view.degraded ? (
    <p role="status">Some scoring details for this submission could not be fully read.</p>
  ) : null;
}

export function SummaryFacts({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-label="Report summary">
      <h2>Overall result</h2>
      <p>{view.summary.headline}</p>
      <p>{view.summary.headlineLabel}</p>
      {view.summary.tierMessage ? <p>{view.summary.tierMessage}</p> : null}
      <dl>
        <div><dt>Total points</dt><dd>{view.summary.overallTotalLabel}</dd></div>
        <div><dt>Average per item</dt><dd>{view.summary.overallAverageLabel}</dd></div>
        <div><dt>Answered items</dt><dd>{view.summary.answeredItems}</dd></div>
        <div><dt>Sections</dt><dd>{view.summary.sectionCount}</dd></div>
      </dl>
    </section>
  );
}

export function StrengthsAndPriorities({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-label="Strengths and priorities">
      <h2>Decision signals</h2>
      <h3>Strengths</h3>
      <ul>
        {view.insights.strengths.map((item) => (
          <li className="report-signal report-signal--strength" data-performance-status="strength" key={item.stableKey} data-testid={`report-style-strength-${item.stableKey}`}>
            <span className="report-status report-status--strength">Strength</span> {item.label}: {item.averageAcrossSectionsLabel}
          </li>
        ))}
      </ul>
      <h3>Priorities</h3>
      <ul>
        {view.insights.priorities.map((item) => (
          <li className="report-signal report-signal--priority" data-action-priority="priority" key={item.stableKey} data-testid={`report-style-priority-${item.stableKey}`}>
            <span className="report-status report-status--priority">Priority</span> {item.label}: {item.averageAcrossSectionsLabel}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shared semantic ledger: the two renderers differ in placement, never facts. */
export function DecisionLedger({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-labelledby="report-style-decisions-title">
      <h2 id="report-style-decisions-title">Five Decisions</h2>
      <p>Average across sections</p>
      <ol>
        {view.decisions.map((decision) => {
          const status = performanceStatus(decision.averageAcrossSections);
          return (
            <li className="report-decision" data-decision={decision.stableKey} data-performance-status={status.key} key={decision.stableKey} data-testid={`report-style-decision-${decision.stableKey}`}>
              <span className="report-decision-metric"><strong>{decision.label}</strong>: {decision.averageAcrossSectionsLabel} · {decision.totalPointsLabel} total points</span>
              <span className={`report-status report-status--${status.key}`}>{status.label}</span>
            </li>
          );
        })}
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
          <tr><th>Decision</th><th>Score</th><th>Status</th><th>Action</th></tr>
        </thead>
        <tbody>
          {view.decisions.map((decision) => {
            const status = performanceStatus(decision.averageAcrossSections);
            const actionPriority = view.insights.priorities.some((item) => item.stableKey === decision.stableKey);
            return (
              <tr className="report-score-row" data-action-priority={actionPriority ? "priority" : "maintain"} data-decision={decision.stableKey} data-performance-status={status.key} data-testid={`report-style-matrix-${decision.stableKey}`} key={decision.stableKey}>
                <th scope="row">{decision.label}</th>
                <td>{decision.averageAcrossSectionsLabel}</td>
                <td><span className={`report-status report-status--${status.key}`}>{status.label}</span></td>
                <td>{actionPriority ? "Priority action" : "Maintain momentum"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function SectionEvidence({ view }: { view: ScoredReportViewModel }) {
  return (
    <section aria-label="Section and question evidence">
      <h2>Section evidence</h2>
      {view.sections.map((section) => {
        const status = performanceStatus(section.averagePoints);
        return (
          <section className="report-section" data-performance-status={status.key} key={section.stableKey} data-testid={`report-style-section-${section.stableKey}`}>
            <h3>{section.label}</h3>
            <p>{section.totalPointsLabel} total points · {section.averagePointsLabel} average · {section.achievedCount} of {section.totalCount} achieved · <span className={`report-status report-status--${status.key}`}>{status.label}</span></p>
            <table>
              <thead><tr><th>Question</th><th>Value</th><th>Status</th></tr></thead>
              <tbody>
                {section.questions.map((question) => (
                  <tr className="report-question" data-achievement-status={question.achieved ? "achieved" : "not-achieved"} key={question.stableKey} data-testid={`report-style-question-${question.stableKey}`}>
                    <th scope="row">{question.label}{question.unmapped ? " (unmapped)" : ""}</th>
                    <td>{question.scoreLabel}</td>
                    <td>{question.achievementMarker?.label ?? (question.achieved ? "achieved" : "not achieved")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {view.orphanQuestions.length > 0 ? (
        <section>
          <h3>Other questions</h3>
          <table>
            <thead><tr><th>Question</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>
              {view.orphanQuestions.map((question) => (
                <tr className="report-question" data-achievement-status={question.achieved ? "achieved" : "not-achieved"} key={question.stableKey} data-testid={`report-style-question-${question.stableKey}`}>
                  <th scope="row">{question.label}{question.unmapped ? " (unmapped)" : ""}</th>
                  <td>{question.scoreLabel}</td>
                  <td>{question.achievementMarker?.label ?? (question.achieved ? "achieved" : "not achieved")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

export function SectionScorecard({ view }: { view: ScoredReportViewModel }) {
  if (!view.scorecard.visible) return null;
  return (
    <section aria-label="Section scorecard">
      <h2>Section scorecard</h2>
      <table>
        <thead><tr><th>Section</th><th>Total points</th><th>Average</th><th>Status</th></tr></thead>
        <tbody>
          {view.scorecard.rows.map((row) => {
            const status = performanceStatus(row.averagePoints);
            return (
              <tr className="report-score-row" data-performance-status={status.key} key={row.stableKey} data-testid={`report-style-scorecard-${row.stableKey}`}>
                <th scope="row">{row.label}</th><td>{row.totalPointsLabel}</td><td>{row.averagePointsLabel}</td><td><span className={`report-status report-status--${status.key}`}>{status.label}</span></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr><th scope="row">Total</th><td>{view.scorecard.total.totalPoints}</td><td>{view.scorecard.total.overallAverage}</td><td>Overall</td></tr></tfoot>
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
        <div className="report-action-group" data-action-priority="priority" key={group.sectionStableKey ?? group.label}>
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
      <h2>Keep Scaling, {view.closingGreeting}.</h2>
      <p>You&apos;ve completed your assessment. Turn these results into a 90-day plan with your coach.</p>
      <CoachLogo url={view.coach.logoUrl} name={view.coach.name} variant="footer" />
      <p>
        Confidential assessment report · {view.provenance.templateName} · submission {view.provenance.submissionId ?? "unavailable"} · version {view.provenance.versionId ?? "unavailable"} · hash {view.provenance.contentHash ?? "unavailable"}
        {view.provenance.imported ? " · imported" : ""}
      </p>
      <a href={view.cta.learnMoreHref}>Learn More →</a>
      {view.cta.eligible ? <a href={view.cta.href}>{view.cta.label}</a> : null}
    </footer>
  );
}
