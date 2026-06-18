/**
 * Assessment v7.6 Wave F #22 — ScoredGroupReport (T7).
 *
 * The team-level scored report (Rockefeller Habits / Five Dysfunctions / SU
 * Full): reads each submission's FROZEN result and presents the CEO vs. the
 * NON-CEO team average. Pure presentational — every figure comes from the data
 * layer; the renderer NEVER recomputes a score.
 *
 * Anatomy (from wave-f-group-report-mockup.html):
 *   cover → "as of" line → alignment profile (Section | CEO | Team avg (excl.
 *   CEO) | Dev, with a ▲/▼ DIRECTIONAL indicator — alignment, not good/bad) →
 *   tier band → optional domains block + ScaleUp score (presence-driven) →
 *   per-question CEO-vs-team bars → footer.
 *
 * N<2 fallback: when a section/domain has zero non-CEO contributors, teamAvg
 * and dev are null; the cell shows "—" rather than comparing the CEO to himself.
 *
 * Graceful degrade (G2): if no respondent isCEO, the CEO column is dropped (a
 * team-only view) and the no-CEO note is shown. Empty state: respondentCount
 * === 0 → a clean panel.
 *
 * Brand scope (ADR-0005): root wrapped in `.su-public-brand .su-report`.
 */

import type {
  GroupScoredSection,
  GroupScoredDomain,
  GroupScoredQuestion,
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

/** A directional deviation cell — ▲/▼ shows alignment direction, not good/bad. */
function DevCell({ dev, testId }: { dev: number | null; testId: string }) {
  if (dev === null || !Number.isFinite(dev)) {
    return (
      <td className="su-group-dev na" data-testid={testId}>
        — <span className="su-group-dev-note">(N&lt;2)</span>
      </td>
    );
  }
  const up = dev >= 0;
  const sign = up ? "+" : "−";
  const magnitude = formatGroupNumber(Math.abs(dev));
  return (
    <td className={up ? "su-group-dev up" : "su-group-dev dn"} data-testid={testId}>
      <span aria-hidden="true" className="su-group-dev-arrow">
        {up ? "▲" : "▼"}
      </span>
      <span>
        {sign}
        {magnitude}
      </span>
    </td>
  );
}

/** A CEO numeric cell — "—" when null. */
function ceoCell(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "—" : formatGroupNumber(v);
}

// ── Alignment profile (sections / domains) ───────────────────────────────────

function ProfileTable({
  rows,
  hasCeo,
}: {
  rows: Array<{
    key: string;
    label: string;
    ceo: number | null;
    teamAvg: number | null;
    dev: number | null;
  }>;
  hasCeo: boolean;
}) {
  return (
    <table className="su-group-prof" data-testid="group-scored-profile">
      <thead>
        <tr>
          <th scope="col">Section</th>
          {hasCeo && (
            <th scope="col" className="su-group-ceo">
              CEO
            </th>
          )}
          <th scope="col">
            Team avg<span className="su-group-prof-sub">(excl. CEO)</span>
          </th>
          {hasCeo && <th scope="col">Dev</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} data-testid={`group-scored-section-${r.key}`}>
            <th scope="row">{r.label}</th>
            {hasCeo && (
              <td className="su-group-ceo" data-testid={`group-scored-ceo-${r.key}`}>
                {ceoCell(r.ceo)}
              </td>
            )}
            <td data-testid={`group-scored-team-${r.key}`}>
              {r.teamAvg === null ? (
                <span className="su-group-na">—</span>
              ) : (
                formatGroupNumber(r.teamAvg)
              )}
            </td>
            {hasCeo && <DevCell dev={r.dev} testId={`group-scored-dev-${r.key}`} />}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function toProfileRows(
  sections: GroupScoredSection[],
): Array<{ key: string; label: string; ceo: number | null; teamAvg: number | null; dev: number | null }> {
  return sections.map((s) => ({
    key: s.stableKey,
    label: s.name,
    ceo: s.ceo,
    teamAvg: s.teamAvg,
    dev: s.dev,
  }));
}

// ── Domains block ────────────────────────────────────────────────────────────

function DomainsBlock({
  domains,
  hasCeo,
}: {
  domains: GroupScoredDomain[];
  hasCeo: boolean;
}) {
  return (
    <section className="su-group-sec" data-testid="group-scored-domains">
      <h2 className="su-group-sec-title">By domain — CEO vs. team</h2>
      <ProfileTable
        rows={domains.map((d) => ({
          key: d.key,
          label: d.label,
          ceo: d.ceo,
          teamAvg: d.teamAvg,
          dev: d.dev,
        }))}
        hasCeo={hasCeo}
      />
    </section>
  );
}

// ── Per-question CEO vs team bars ────────────────────────────────────────────

function QuestionBars({
  questions,
  hasCeo,
}: {
  questions: GroupScoredQuestion[];
  hasCeo: boolean;
}) {
  // Scale bars by the maximum value present so the longest bar fills the track.
  const maxVal =
    Math.max(
      1,
      ...questions.flatMap((q) =>
        [q.ceo, q.teamMean].filter(
          (v): v is number => v !== null && Number.isFinite(v),
        ),
      ),
    ) || 1;
  const width = (v: number | null): number =>
    v === null || !Number.isFinite(v) ? 0 : Math.max(2, (v / maxVal) * 100);

  return (
    <section className="su-group-sec" data-testid="group-scored-questions">
      <h2 className="su-group-sec-title">By question — CEO vs. team</h2>
      {questions.map((q) => (
        <div
          className="su-group-qbar"
          key={q.stableKey}
          data-testid={`group-scored-question-${q.stableKey}`}
        >
          <span className="su-group-qbar-lab">{q.label}</span>
          <span className="su-group-qbar-pair">
            {hasCeo && (
              <span
                className="su-group-qbar-b c"
                style={{ width: `${width(q.ceo)}%` }}
              >
                <span className="su-group-qbar-k">CEO {ceoCell(q.ceo)}</span>
              </span>
            )}
            <span
              className="su-group-qbar-b t"
              style={{ width: `${width(q.teamMean)}%` }}
            >
              <span className="su-group-qbar-k">
                Team{" "}
                {q.teamMean === null ? "—" : formatGroupNumber(q.teamMean)}
              </span>
            </span>
          </span>
        </div>
      ))}
    </section>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ScoredGroupReport(props: GroupReportProps) {
  const { report } = props;
  const scored = report.scored;
  const hasCeo = cohortHasCeo(report);

  return (
    <div className="su-public-brand su-report" data-testid="scored-group-report">
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

        {report.respondentCount === 0 || !scored ? (
          <GroupReportEmpty />
        ) : (
          <>
            {!hasCeo && <GroupReportNoCeoNote ceoName={props.ceoName} />}

            {/* ── Alignment profile (sections) ────────────────────────────── */}
            <section className="su-group-sec" data-testid="group-scored-profile-section">
              <h2 className="su-group-sec-title">
                Alignment profile
                {hasCeo && scored.tier.ceo ? (
                  <span className="su-group-tier" data-testid="group-scored-ceo-tier">
                    CEO tier: {scored.tier.ceo}
                  </span>
                ) : null}
              </h2>
              <p className="su-group-intro">
                Section scores — the CEO vs. the team average of the other
                leaders (CEO excluded), with the gap. ▲/▼ show direction, not
                good/bad.
              </p>
              <ProfileTable rows={toProfileRows(scored.sections)} hasCeo={hasCeo} />

              {scored.tier.teamDistribution.length > 0 && (
                <div
                  className="su-group-tierband"
                  data-testid="group-scored-tier-band"
                >
                  <span className="su-group-tierband-lab">Team tiers:</span>
                  {scored.tier.teamDistribution.map((t) => (
                    <span className="su-group-tierband-t" key={t.label}>
                      {t.label} ×{t.count}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* ── Domains (presence-driven) ───────────────────────────────── */}
            {scored.domains && scored.domains.length > 0 && (
              <DomainsBlock domains={scored.domains} hasCeo={hasCeo} />
            )}

            {/* ── ScaleUp Score (presence-driven) ─────────────────────────── */}
            {scored.scaleUpScore && (
              <section className="su-group-sec" data-testid="group-scored-scaleup">
                <h2 className="su-group-sec-title">ScaleUp Score</h2>
                <div className="su-group-scaleup">
                  {hasCeo && (
                    <span className="su-group-scaleup-fig">
                      <span className="su-group-scaleup-lab">CEO</span>
                      <span className="su-group-scaleup-val su-group-ceo">
                        {ceoCell(scored.scaleUpScore.ceo)}
                      </span>
                    </span>
                  )}
                  <span className="su-group-scaleup-fig">
                    <span className="su-group-scaleup-lab">Team avg (excl. CEO)</span>
                    <span className="su-group-scaleup-val">
                      {scored.scaleUpScore.teamAvg === null
                        ? "—"
                        : formatGroupNumber(scored.scaleUpScore.teamAvg)}
                    </span>
                  </span>
                </div>
              </section>
            )}

            {/* ── Per-question bars ───────────────────────────────────────── */}
            {scored.questions.length > 0 && (
              <QuestionBars questions={scored.questions} hasCeo={hasCeo} />
            )}
          </>
        )}
      </div>

      <GroupReportFooter generatedAt={props.generatedAt} />
    </div>
  );
}

export default ScoredGroupReport;
