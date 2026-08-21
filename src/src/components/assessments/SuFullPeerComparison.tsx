import type {
  SuFullPeerPresentation,
  SuFullPeerQuestionComparison,
  SuFullPeerSectionComparison,
} from "@/lib/assessments/su-full-peer-presentation";

const PEER_DISCLOSURE = "Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.";

function formatValue(value: number): string {
  return value.toFixed(1);
}

function fillWidth(value: number): string {
  return `${Math.max(0, Math.min(10, value)) * 10}%`;
}

function provenanceLabel(presentation: SuFullPeerPresentation): string {
  return presentation.provenance.legacy
    ? `Legacy baseline · ${presentation.provenance.sourceId}`
    : `Phase P${presentation.provenance.phase} · ${presentation.provenance.sourceId}`;
}

function PairedBars({
  question,
  testId,
}: {
  question: SuFullPeerQuestionComparison;
  testId: string;
}) {
  return (
    <div className="su-peer-bars" data-testid={testId}>
      <div className="su-peer-measure">
        <span className="su-peer-measure-label">You</span>
        <span className="su-peer-track" aria-hidden="true">
          <span
            className="su-peer-fill su-peer-fill--you"
            style={{ width: fillWidth(question.you) }}
          />
        </span>
        <strong className="su-peer-value">{formatValue(question.you)}</strong>
      </div>
      <div className="su-peer-measure">
        <span className="su-peer-measure-label">Peers</span>
        <span className="su-peer-track" aria-hidden="true">
          <span
            className="su-peer-fill su-peer-fill--peers"
            style={{ width: fillWidth(question.peers) }}
          />
        </span>
        <strong className="su-peer-value">{formatValue(question.peers)}</strong>
      </div>
    </div>
  );
}

function SuFullPeerOverview({
  section,
}: {
  section: SuFullPeerSectionComparison;
}) {
  return (
    <section
      className="su-peer-overview"
      data-testid={`su-full-peer-overview-${section.stableKey}`}
    >
      <div className="su-report-eyebrow">Section overview</div>
      <h2 className="su-h2 su-report-sec-title">{section.label}</h2>
      <ul className="su-peer-overview-list">
        {section.questions.map((question) => (
          <li
            className="su-peer-overview-row"
            data-testid={`su-full-peer-overview-row-${question.stableKey}`}
            key={question.stableKey}
          >
            <h3 className="su-peer-question-label">{question.label}</h3>
            <PairedBars
              question={question}
              testId={`su-full-peer-overview-bars-${question.stableKey}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SuFullPeerDetails({
  section,
}: {
  section: SuFullPeerSectionComparison;
}) {
  return (
    <section className="su-peer-details">
      <div className="su-report-eyebrow">Question details</div>
      <h2 className="su-h2 su-report-sec-title">{section.label}: feedback</h2>
      <div className="su-peer-detail-grid">
        {section.questions.map((question) => (
          <article
            className="su-peer-detail"
            data-testid={`su-full-peer-detail-${question.stableKey}`}
            key={question.stableKey}
          >
            <h3 className="su-peer-detail-title">{question.label}</h3>
            <PairedBars
              question={question}
              testId={`su-full-peer-bars-${question.stableKey}`}
            />
            {question.recommendation?.trim() ? (
              <div
                className="su-peer-feedback"
                data-testid={`su-full-peer-feedback-${question.stableKey}`}
              >
                <h4 className="su-peer-feedback-title">Frozen feedback</h4>
                <p>{question.recommendation}</p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export function SuFullPeerComparison({
  presentation,
}: {
  presentation: SuFullPeerPresentation;
}) {
  return (
    <section className="su-peer-sequence" data-testid="su-full-peer-sequence">
      {presentation.sections.map((section) => (
        <section className="su-peer-chapter" key={section.stableKey}>
          <SuFullPeerOverview section={section} />
          <SuFullPeerDetails section={section} />
        </section>
      ))}
      <p className="su-peer-disclosure" data-testid="su-full-peer-disclosure">
        <span>{PEER_DISCLOSURE}</span>
        <span className="su-peer-provenance">{provenanceLabel(presentation)}</span>
      </p>
    </section>
  );
}
