/**
 * Assessment v7.6 Wave F #22 — ScoredGroupReport (T7).
 *
 * The team-level scored report (Rockefeller Habits / Five Dysfunctions / SU
 * Full) reads each submission's FROZEN result. Rockefeller and SU Full present
 * the CEO vs. the NON-CEO team average; Five Dysfunctions presents named
 * respondent answers plus an all-respondent team average. Pure presentational —
 * every figure comes from the data layer; the renderer NEVER recomputes a score.
 *
 * Anatomy (from wave-f-group-report-mockup.html):
 *   cover → "as of" line → alignment profile (Section | CEO | Team avg (excl.
 *   CEO) | Dev, with a ▲/▼ DIRECTIONAL indicator — alignment, not good/bad) →
 *   tier band → optional domains block + ScaleUp score (presence-driven) →
 *   per-question CEO-vs-team bars → footer. Five Dysfunctions replaces those
 *   comparison blocks with the five team-fundamental averages and a named
 *   answer matrix ending in the collective average.
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
  GroupScoredIndividualResponse,
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
  responsiveEnabled = false,
  label = "Alignment profile comparison table",
}: {
  rows: ProfileRow[];
  hasCeo: boolean;
  responsiveEnabled?: boolean;
  label?: string;
}) {
  // Omit-empty: only show the Peers + peer-deviation columns when ≥1 row
  // carries a finite peer benchmark.
  const hasPeers = rows.some((r) => r.peers != null && Number.isFinite(r.peers));
  return (
    <div
      className={
        responsiveEnabled
          ? "su-group-prof-scroll su-report-data-region"
          : "su-group-prof-scroll"
      }
      {...(responsiveEnabled
        ? { role: "region", tabIndex: 0, "aria-label": label }
        : {})}
    >
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

function TeamSummaryTable({ sections }: { sections: GroupScoredSection[] }) {
  return (
    <div className="su-group-prof-scroll">
      <table
        className="su-group-prof su-group-team-summary"
        data-testid="group-scored-team-summary"
      >
        <thead>
          <tr>
            <th scope="col">Team fundamental</th>
            <th scope="col">Team average</th>
            <th scope="col">Responses</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr key={section.stableKey}>
              <th scope="row">{section.name}</th>
              <td>
                {section.groupMean == null ? (
                  <span className="su-group-na">—</span>
                ) : (
                  formatGroupNumber(section.groupMean)
                )}
              </td>
              <td>{section.groupN ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Domains block ────────────────────────────────────────────────────────────

function DomainsBlock({
  domains,
  hasCeo,
  responsiveEnabled,
}: {
  domains: GroupScoredDomain[];
  hasCeo: boolean;
  responsiveEnabled: boolean;
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
        responsiveEnabled={responsiveEnabled}
        label="Domain comparison table"
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
  const hasPeers = questions.some(
    (q) => q.peers != null && Number.isFinite(q.peers),
  );
  // SU-Full uses the source's fixed 0–10 scale; legacy scored reports retain
  // their existing relative scale when no answer-level benchmark is present.
  const maxVal = hasPeers
    ? 10 // Scaling Up Full source contract: every answer bar uses a fixed 0–10 scale.
    : Math.max(
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
      <h2 className="su-group-sec-title">
        {hasPeers
          ? hasCeo
            ? "By question — CEO vs. team vs. peers"
            : "By question — team vs. peers"
          : "By question — CEO vs. team"}
      </h2>
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
            {q.peers != null && Number.isFinite(q.peers) && (
              <span
                className="su-group-qbar-b p"
                style={{ width: `${width(q.peers)}%` }}
              >
                <span className="su-group-qbar-k">
                  Peers {formatGroupNumber(q.peers)}
                </span>
              </span>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

function NamedIndividualResponses({
  questions,
  responsiveEnabled,
}: {
  questions: GroupScoredQuestion[];
  responsiveEnabled: boolean;
}) {
  const respondents = questions.find(
    (question) => question.individualResponses?.length,
  )?.individualResponses as GroupScoredIndividualResponse[] | undefined;
  if (!respondents?.length) return null;

  return (
    <section
      className="su-group-sec"
      data-testid="group-scored-individual-responses"
    >
      <h2 className="su-group-sec-title">Individual answers and team average</h2>
      <p className="su-group-intro">
        Each column shows a team member&rsquo;s response. The team average includes
        every respondent, including the CEO.
      </p>
      <div
        className={
          responsiveEnabled
            ? "su-group-prof-scroll su-report-data-region"
            : "su-group-prof-scroll"
        }
        {...(responsiveEnabled
          ? {
              role: "region",
              tabIndex: 0,
              "aria-label": "Named individual answers and team averages",
            }
          : {})}
      >
        <table className="su-group-prof su-group-individual-matrix">
          <thead>
            <tr>
              <th scope="col">Question</th>
              {respondents.map((respondent) => (
                <th scope="col" key={respondent.respondentId}>
                  {respondent.name}
                  {respondent.isCEO && (
                    <span className="su-group-prof-sub">CEO</span>
                  )}
                </th>
              ))}
              <th scope="col" className="su-group-team-average">
                Team average
              </th>
            </tr>
          </thead>
          <tbody>
            {questions.map((question) => {
              const values = new Map(
                question.individualResponses?.map((response) => [
                  response.respondentId,
                  response.value,
                ]),
              );
              return (
                <tr
                  key={question.stableKey}
                  data-testid={`group-scored-individual-question-${question.stableKey}`}
                >
                  <th scope="row">{question.label}</th>
                  {respondents.map((respondent) => {
                    const value = values.get(respondent.respondentId);
                    return (
                      <td key={respondent.respondentId}>
                        {value == null ? (
                          <span className="su-group-na">—</span>
                        ) : (
                          formatGroupNumber(value)
                        )}
                      </td>
                    );
                  })}
                  <td className="su-group-team-average">
                    {question.groupMean == null ? (
                      <span className="su-group-na">—</span>
                    ) : (
                      formatGroupNumber(question.groupMean)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
function AppendixB({
  rows,
  responsiveEnabled,
}: {
  rows: GroupAppendixBRow[];
  responsiveEnabled: boolean;
}) {
  return (
    <section className="su-group-sec" data-testid="group-scored-appendix-b">
      <h2 className="su-group-sec-title">Appendix B — team members (anonymized)</h2>
      <p className="su-group-intro">
        Each team member&rsquo;s domain scores, de-identified. Members are listed
        as &ldquo;Person 1&rdquo;…&ldquo;Person N&rdquo; — names are not shown.
      </p>
      <div
        className={
          responsiveEnabled
            ? "su-group-prof-scroll su-report-data-region"
            : "su-group-prof-scroll"
        }
        {...(responsiveEnabled
          ? {
              role: "region",
              tabIndex: 0,
              "aria-label": "Appendix B team member comparison table",
            }
          : {})}
      >
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
              <tr key={i} data-testid={`group-scored-appendix-b-row-${i}`}>
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
  const responsiveEnabled = props.responsiveEnabled === true;
  const scored = report.scored;
  const hasCeo = cohortHasCeo(report);
  const showsNamedTeamResponses = props.templateAlias === "five-dysfunctions";
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
    <div
      className="su-public-brand su-report"
      data-testid="scored-group-report"
      data-responsive-report={responsiveEnabled ? "" : undefined}
    >
      <GroupReportCover
        assessmentName={
          props.templateAlias === "five-dysfunctions"
            ? props.assessmentName.replace(/^the\s+/i, "")
            : props.assessmentName
        }
        companyName={props.companyName}
        generatedAt={props.generatedAt}
        coachLogoUrl={props.coachLogoUrl}
        coachName={props.coachName}
        isImported={props.isImported}
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
            {!hasCeo && !showsNamedTeamResponses && (
              <GroupReportNoCeoNote ceoName={props.ceoName} />
            )}

            {/* ── Alignment profile (sections) ────────────────────────────── */}
            <section className="su-group-sec" data-testid="group-scored-profile-section">
              <h2 className="su-group-sec-title">
                {showsNamedTeamResponses ? "Team results" : "Alignment profile"}
                {!showsNamedTeamResponses && showTier && hasCeo && scored.tier.ceo ? (
                  <span className="su-group-tier" data-testid="group-scored-ceo-tier">
                    CEO tier: {scored.tier.ceo}
                  </span>
                ) : null}
              </h2>
              {showsNamedTeamResponses ? (
                <>
                  <p className="su-group-intro">
                    The team score for each fundamental averages every completed
                    respondent, including the CEO.
                  </p>
                  <TeamSummaryTable sections={scored.sections} />
                </>
              ) : (
                <>
                  <p className="su-group-intro">
                    Section scores — the CEO vs. the team average of the other
                    leaders (CEO excluded), with the gap. ▲/▼ show direction, not
                    good/bad.
                  </p>
                  <ProfileTable
                    rows={toProfileRows(scored.sections)}
                    hasCeo={hasCeo}
                    responsiveEnabled={responsiveEnabled}
                  />
                </>
              )}

              {!showsNamedTeamResponses && showTier && scored.tier.teamDistribution.length > 0 && (
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
            {!showsNamedTeamResponses && scored.domains && scored.domains.length > 0 && (
              <DomainsBlock
                domains={scored.domains}
                hasCeo={hasCeo}
                responsiveEnabled={responsiveEnabled}
              />
            )}

            {/* ── ScaleUp Score (presence-driven) ─────────────────────────── */}
            {!showsNamedTeamResponses && scored.scaleUpScore && (
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
            {scored.questions.length > 0 && !showsNamedTeamResponses && (
              <QuestionBars questions={scored.questions} hasCeo={hasCeo} />
            )}

            {scored.questions.length > 0 && showsNamedTeamResponses && (
              <NamedIndividualResponses
                questions={scored.questions}
                responsiveEnabled={responsiveEnabled}
              />
            )}

            {/* ── Appendix B — pseudonymized per-member grid (SU-Full) ──────── */}
            {!showsNamedTeamResponses &&
              scored.appendixB &&
              scored.appendixB.length > 0 && (
              <AppendixB
                rows={scored.appendixB}
                responsiveEnabled={responsiveEnabled}
              />
              )}
          </>
        )}
      </div>

      <GroupReportFooter
        generatedAt={props.generatedAt}
        coachLogoUrl={props.coachLogoUrl}
        coachName={props.coachName}
      />
    </div>
  );
}

export default ScoredGroupReport;
