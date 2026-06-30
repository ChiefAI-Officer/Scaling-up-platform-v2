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
  GroupAppendixBRow,
} from "@/lib/assessments/group-report-model";
import { APPENDIX_B_DOMAIN_KEYS } from "@/lib/assessments/group-report-model";
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

/**
 * A directional deviation cell — ▲/▼ shows alignment direction, not good/bad.
 *
 * `reason` distinguishes the null-cell treatment:
 *  - "team" (default): a null deviation means "N<2 non-CEO contributors" → the
 *    cell prints "— (N<2)" to explain why there's no team comparison.
 *  - "peer": a null deviation means the Peers benchmark has no value for this
 *    row (omit-empty) → a plain "—" with NO "(N<2)" note (the peer is a static
 *    benchmark, not a cohort sample, so an N-size note would be misleading).
 */
function DevCell({
  dev,
  testId,
  reason = "team",
}: {
  dev: number | null;
  testId: string;
  reason?: "team" | "peer";
}) {
  if (dev === null || !Number.isFinite(dev)) {
    return (
      <td className="su-group-dev na" data-testid={testId}>
        —{reason === "team" && <span className="su-group-dev-note"> (N&lt;2)</span>}
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

interface ProfileRow {
  key: string;
  label: string;
  ceo: number | null;
  teamAvg: number | null;
  dev: number | null;
  /** Peers benchmark (Wave J / J-2) — undefined/null for non-SU-Full rows. */
  peers?: number | null;
  devPeers?: number | null;
  devPeersTeam?: number | null;
}

/** A Peers numeric cell — "—" when null/absent. */
function peerCell(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : formatGroupNumber(v);
}

function ProfileTable({
  rows,
  hasCeo,
}: {
  rows: ProfileRow[];
  hasCeo: boolean;
}) {
  // Omit-empty: only show the Peers + peer-deviation columns when ≥1 row
  // carries a finite peer benchmark.
  const hasPeers = rows.some((r) => r.peers != null && Number.isFinite(r.peers));
  return (
    <div className="su-group-prof-scroll">
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
            {hasPeers && (
              <th scope="col" className="su-group-peers">
                Peers
              </th>
            )}
            {hasPeers && (
              <th scope="col">{hasCeo ? "Dev · Peers" : "Team vs Peers"}</th>
            )}
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
              {hasPeers && (
                <td
                  className="su-group-peers"
                  data-testid={`group-scored-peers-${r.key}`}
                >
                  {peerCell(r.peers)}
                </td>
              )}
              {hasPeers && (
                <DevCell
                  dev={(hasCeo ? r.devPeers : r.devPeersTeam) ?? null}
                  testId={`group-scored-devpeers-${r.key}`}
                  reason="peer"
                />
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toProfileRows(sections: GroupScoredSection[]): ProfileRow[] {
  return sections.map((s) => ({
    key: s.stableKey,
    label: s.name,
    ceo: s.ceo,
    teamAvg: s.teamAvg,
    dev: s.dev,
    peers: s.peers,
    devPeers: s.devPeers,
    devPeersTeam: s.devPeersTeam,
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
          peers: d.peers,
          devPeers: d.devPeers,
          devPeersTeam: d.devPeersTeam,
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

// ── Appendix B — pseudonymized per-member domain grid ────────────────────────

/** Display labels for the 4 Appendix-B domains (People/Strategy/Execution/Cash). */
const APPENDIX_B_DOMAIN_LABELS: Record<(typeof APPENDIX_B_DOMAIN_KEYS)[number], string> = {
  people: "People",
  strategy: "Strategy",
  execution: "Execution",
  cash: "Cash",
};

/**
 * Appendix B (Task 3) — the Esperto "Anonymous Team" de-identified per-member
 * grid: rows "Person 1".."Person N" (no names), columns the 4 domains
 * People/Strategy/Execution/Cash (the CEO-personal "You" domain is excluded),
 * cells = each person's 0–10 domain score ("—" when they answered none).
 */
function AppendixB({ rows }: { rows: GroupAppendixBRow[] }) {
  return (
    <section className="su-group-sec" data-testid="group-scored-appendix-b">
      <h2 className="su-group-sec-title">Appendix B — team members (anonymized)</h2>
      <p className="su-group-intro">
        Each team member&rsquo;s domain scores, de-identified. Members are listed
        as &ldquo;Person 1&rdquo;…&ldquo;Person N&rdquo; — names are not shown.
      </p>
      <div className="su-group-prof-scroll">
        <table className="su-group-prof su-group-apxb" data-testid="group-scored-appendix-b-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              {APPENDIX_B_DOMAIN_KEYS.map((key) => (
                <th scope="col" key={key}>
                  {APPENDIX_B_DOMAIN_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.personLabel} data-testid={`group-scored-appendix-b-row-${i}`}>
                <th scope="row">{row.personLabel}</th>
                {APPENDIX_B_DOMAIN_KEYS.map((key) => (
                  <td key={key} data-testid={`group-scored-appendix-b-cell-${i}-${key}`}>
                    {row.domainScores[key] === null ? (
                      <span className="su-group-na">—</span>
                    ) : (
                      formatGroupNumber(row.domainScores[key] as number)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ScoredGroupReport(props: GroupReportProps) {
  const { report } = props;
  const scored = report.scored;
  const hasCeo = cohortHasCeo(report);
  // Tier presentation policy (Wave J / J-2): SU-Full sets showTier=false to
  // suppress the band; undefined → show (back-compat for every other scored
  // template that predates the flag).
  const showTier = report.showTier !== false;
  // Omit-empty: a provisional Peers footnote only renders when ≥1 scored row
  // (section OR domain) actually carries a finite peer benchmark.
  const hasPeers =
    !!scored &&
    (scored.sections.some((s) => s.peers != null && Number.isFinite(s.peers)) ||
      (scored.domains?.some((d) => d.peers != null && Number.isFinite(d.peers)) ??
        false) ||
      (scored.scaleUpScore?.peers != null &&
        Number.isFinite(scored.scaleUpScore.peers)));

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
                {showTier && hasCeo && scored.tier.ceo ? (
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

              {showTier && scored.tier.teamDistribution.length > 0 && (
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

              {hasPeers && (
                <p
                  className="su-group-footnote"
                  data-testid="group-scored-peers-footnote"
                >
                  Peers = provisional industry benchmark (single Esperto cohort
                  {report.benchmarkVersion ? `, v${report.benchmarkVersion}` : ""});
                  not yet size-matched.
                </p>
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
                  {scored.scaleUpScore.peers != null &&
                    Number.isFinite(scored.scaleUpScore.peers) && (
                      <>
                        <span className="su-group-scaleup-fig">
                          <span className="su-group-scaleup-lab su-group-peers">
                            Peers
                          </span>
                          <span
                            className="su-group-scaleup-val"
                            data-testid="group-scored-scaleup-peers"
                          >
                            {peerCell(scored.scaleUpScore.peers)}
                          </span>
                        </span>
                        {/* ScaleUp Dev·Peers exists ONLY as the CEO deviation
                            (devPeers = ceo − peers); the model carries no
                            devPeersTeam for the headline. With no CEO it is
                            null — show NO deviation figure rather than a blank
                            "—" under a label promising a value. */}
                        {scored.scaleUpScore.devPeers != null &&
                          Number.isFinite(scored.scaleUpScore.devPeers) && (
                            <span className="su-group-scaleup-fig">
                              <span className="su-group-scaleup-lab">Dev · Peers</span>
                              <span
                                className="su-group-scaleup-val"
                                data-testid="group-scored-scaleup-devpeers"
                              >
                                {peerCell(scored.scaleUpScore.devPeers)}
                              </span>
                            </span>
                          )}
                      </>
                    )}
                </div>
              </section>
            )}

            {/* ── Per-question bars ───────────────────────────────────────── */}
            {scored.questions.length > 0 && (
              <QuestionBars questions={scored.questions} hasCeo={hasCeo} />
            )}

            {/* ── Appendix B — pseudonymized per-member grid (SU-Full) ──────── */}
            {scored.appendixB && scored.appendixB.length > 0 && (
              <AppendixB rows={scored.appendixB} />
            )}
          </>
        )}
      </div>

      <GroupReportFooter generatedAt={props.generatedAt} />
    </div>
  );
}

export default ScoredGroupReport;
