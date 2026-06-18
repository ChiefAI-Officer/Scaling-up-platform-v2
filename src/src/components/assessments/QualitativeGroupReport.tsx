/**
 * Assessment v7.6 Wave F #22 — QualitativeGroupReport (T7).
 *
 * The team-level qualitative report (LVA / QSP): aggregates ALL completed
 * submissions of a campaign into one report. Pure presentational — it consumes
 * the frozen `CampaignGroupReport` (reportType === "qualitative") + provenance
 * props and renders the approved Esperto "CEO Full Report" anatomy from the
 * sign-off mockup (wave-f-group-report-mockup.html):
 *
 *   cover → "as of" line → per-section block (switch on `presentation`) → footer
 *
 * Per-section presentation forms (all from the data layer — the renderer stays
 * dumb, NEVER re-aggregating):
 *   - metric-table → a matrix: Metric | Mean | <each respondent, CEO marked
 *                    "(CEO)"> | n. Columns follow `report.respondents` order;
 *                    a non-answerer cell is blank ("—").
 *   - rating       → stacked Weak/Average/Strong bars + mean + n, in the given
 *                    (mean-desc) order, with a legend.
 *   - choices      → %-of-answerers bars, ALL options (incl. 0%), labels not
 *                    codes, + the answerer denominator n.
 *   - qa           → free-text answers (answerers only, CEO first) and/or a
 *                    standalone-NUMBER per-respondent list + mean.
 *
 * Graceful degrade (G2): if no respondent isCEO, the CEO column is dropped and
 * the no-CEO note is shown. Empty state: respondentCount === 0 → a clean panel.
 *
 * Brand scope (ADR-0005): root wrapped in `.su-public-brand .su-report`.
 */

import type {
  GroupQualitativeSection,
  GroupRespondent,
  GroupMetricTableSection,
  GroupRatingSection,
  GroupChoicesSection,
  GroupQaSection,
  GroupQaQuestion,
} from "@/lib/assessments/group-report-model";
import {
  GroupReportCover,
  GroupReportAsOf,
  GroupReportFooter,
  GroupReportNoCeoNote,
  GroupReportEmpty,
  formatGroupNumber,
  cohortHasCeo,
  type GroupReportProps,
} from "@/components/assessments/GroupReport";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Column header text for a respondent — CEO is marked "(CEO)". */
function respondentColHeader(r: GroupRespondent): string {
  return r.isCEO ? `${r.name} (CEO)` : r.name;
}

/** Clamp a value to 0–100 for a bar width. */
function pctWidth(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ── Metric-table (matrix) ────────────────────────────────────────────────────

function MetricTableSection({
  section,
  respondents,
}: {
  section: GroupMetricTableSection;
  respondents: GroupRespondent[];
}) {
  return (
    <table
      className="su-group-mtx"
      data-testid={`group-metric-table-${section.stableKey}`}
    >
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col" className="su-group-mean-col">
            Mean
          </th>
          {respondents.map((r) => (
            <th
              scope="col"
              key={r.respondentId}
              className={r.isCEO ? "su-group-ceo" : undefined}
            >
              {respondentColHeader(r)}
            </th>
          ))}
          <th scope="col" className="su-group-n">
            n
          </th>
        </tr>
      </thead>
      <tbody>
        {section.rows.map((row) => {
          const byId = new Map(
            row.perRespondent.map((c) => [c.respondentId, c.value]),
          );
          return (
            <tr key={row.stableKey} data-testid={`group-metric-row-${row.stableKey}`}>
              <th scope="row">{row.label}</th>
              <td className="su-group-mean">{formatGroupNumber(row.mean)}</td>
              {respondents.map((r) => {
                const v = byId.get(r.respondentId);
                if (v === null || v === undefined) {
                  return (
                    <td
                      key={r.respondentId}
                      className="su-group-blank"
                      data-testid={`group-metric-blank-${r.respondentId}`}
                    >
                      —
                    </td>
                  );
                }
                return (
                  <td
                    key={r.respondentId}
                    className={r.isCEO ? "su-group-ceo" : undefined}
                  >
                    {formatGroupNumber(v)}
                  </td>
                );
              })}
              <td className="su-group-n">{row.n}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Rating (stacked Weak/Average/Strong) ─────────────────────────────────────

function RatingSectionBlock({ section }: { section: GroupRatingSection }) {
  const totalN = section.factors[0]?.n ?? 0;
  return (
    <div
      className="su-group-rating"
      data-testid={`group-rating-${section.stableKey}`}
    >
      {section.factors.map((f) => {
        const denom = f.strong + f.avg + f.weak || 1;
        const sPct = (f.strong / denom) * 100;
        const aPct = (f.avg / denom) * 100;
        const wPct = (f.weak / denom) * 100;
        return (
          <div
            className="su-group-rat-row"
            key={f.stableKey}
            data-testid={`group-rating-factor-${f.stableKey}`}
            data-factor={f.stableKey}
          >
            <span className="su-group-rat-lab">{f.label}</span>
            <span
              className="su-group-rat-bar"
              role="img"
              aria-label={`${f.label}: strong ${f.strong}, average ${f.avg}, weak ${f.weak} of ${f.n}`}
            >
              {f.strong > 0 && (
                <span className="s" style={{ width: `${sPct}%` }} />
              )}
              {f.avg > 0 && <span className="a" style={{ width: `${aPct}%` }} />}
              {f.weak > 0 && <span className="w" style={{ width: `${wPct}%` }} />}
            </span>
            <span className="su-group-rat-val">{formatGroupNumber(f.mean)}</span>
          </div>
        );
      })}
      <div className="su-group-legend">
        <span>
          <i className="s" />
          Strong
        </span>
        <span>
          <i className="a" />
          Average
        </span>
        <span>
          <i className="w" />
          Weak
        </span>
        <span className="su-group-legend-note">
          value = mean on the 1–3 scale · n={totalN}
        </span>
      </div>
    </div>
  );
}

// ── Choices (%-of-answerers bars) ────────────────────────────────────────────

function ChoicesSectionBlock({ section }: { section: GroupChoicesSection }) {
  return (
    <div
      className="su-group-choices"
      data-testid={`group-choices-${section.stableKey}`}
    >
      {section.options.map((o) => (
        <div
          className={o.count === 0 ? "su-group-obs zero" : "su-group-obs"}
          key={o.key}
          data-testid={`group-choice-${o.key}`}
        >
          <span className="su-group-obs-lab">{o.label}</span>
          <span
            className="su-group-obs-track"
            role="img"
            aria-label={`${o.label}: ${o.pct}% (${o.count} of ${o.n})`}
          >
            {o.count > 0 && (
              <span
                className="su-group-obs-fill"
                style={{ width: `${pctWidth(o.pct)}%` }}
              />
            )}
          </span>
          <span className="su-group-obs-pct">{o.pct}%</span>
        </div>
      ))}
      <p className="su-group-denom">
        % of the {section.n} respondents who answered.
      </p>
    </div>
  );
}

// ── Q&A (free text + standalone number) ──────────────────────────────────────

function QaQuestionBlock({ question }: { question: GroupQaQuestion }) {
  if (question.kind === "number") {
    return (
      <div
        className="su-group-qa"
        data-testid={`group-qa-question-${question.stableKey}`}
      >
        <h3 className="su-group-qa-q">{question.label}</h3>
        {question.perRespondent.map((p) => (
          <div className="su-group-qa-row" key={p.respondentId}>
            <span
              className={p.isCEO ? "su-group-qa-who su-group-ceo" : "su-group-qa-who"}
            >
              {p.isCEO ? `${p.name} (CEO)` : p.name}
            </span>
            <span className="su-group-qa-num">{formatGroupNumber(p.value)}</span>
          </div>
        ))}
        <p className="su-group-meanline">
          Mean: {formatGroupNumber(question.mean)} · n={question.n}
        </p>
      </div>
    );
  }
  return (
    <div
      className="su-group-qa"
      data-testid={`group-qa-question-${question.stableKey}`}
    >
      <h3 className="su-group-qa-q">{question.label}</h3>
      {/* Answerers only, CEO first — omit-empty: blanks never reach this list. */}
      {question.answers.map((a) => (
        <div className="su-group-qa-row" key={a.respondentId}>
          <span
            className={a.isCEO ? "su-group-qa-who su-group-ceo" : "su-group-qa-who"}
          >
            {a.isCEO ? `${a.name} (CEO)` : a.name}
          </span>
          <span className="su-group-qa-text">{a.text}</span>
        </div>
      ))}
    </div>
  );
}

function QaSectionBlock({ section }: { section: GroupQaSection }) {
  return (
    <div data-testid={`group-qa-${section.stableKey}`}>
      {section.questions.map((q) => (
        <QaQuestionBlock key={q.stableKey} question={q} />
      ))}
    </div>
  );
}

// ── Section dispatch ─────────────────────────────────────────────────────────

function SectionBody({
  section,
  respondents,
}: {
  section: GroupQualitativeSection;
  respondents: GroupRespondent[];
}) {
  switch (section.presentation) {
    case "metric-table":
      return <MetricTableSection section={section} respondents={respondents} />;
    case "rating":
      return <RatingSectionBlock section={section} />;
    case "choices":
      return <ChoicesSectionBlock section={section} />;
    case "qa":
    default:
      return <QaSectionBlock section={section} />;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function QualitativeGroupReport(props: GroupReportProps) {
  const { report } = props;
  const hasCeo = cohortHasCeo(report);
  const sections = report.qualitative?.sections ?? [];

  return (
    <div
      className="su-public-brand su-report"
      data-testid="qualitative-group-report"
    >
      <GroupReportCover
        assessmentName={props.assessmentName}
        companyName={props.companyName}
        generatedAt={props.generatedAt}
      />

      <div className="su-group-body">
        <GroupReportAsOf
          generatedAt={props.generatedAt}
          completedCount={props.completedCount}
          invitedCount={props.invitedCount}
          versionLabel={props.versionLabel}
          ceoName={props.ceoName}
        />

        {report.respondentCount === 0 ? (
          <GroupReportEmpty />
        ) : (
          <>
            {!hasCeo && <GroupReportNoCeoNote ceoName={props.ceoName} />}
            {sections.map((section) => (
              <section
                className="su-group-sec"
                key={section.stableKey}
                data-testid={`group-section-${section.stableKey}`}
              >
                <h2 className="su-group-sec-title">{section.name}</h2>
                <SectionBody section={section} respondents={report.respondents} />
              </section>
            ))}
          </>
        )}
      </div>

      <GroupReportFooter generatedAt={props.generatedAt} />
    </div>
  );
}

export default QualitativeGroupReport;
