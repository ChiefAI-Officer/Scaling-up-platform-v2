/**
 * Assessment v7.6 — BrandedReport (Task 2).
 *
 * The adaptive, brand-scoped per-respondent results report. Pure
 * presentational: it consumes a frozen RespondentReport (loaded + authorized
 * upstream) and renders the approved Esperto-style anatomy
 * (cover → overall → section breakdown → scores table → recommendations →
 * additional responses → conclusion → footer).
 *
 * Adaptation (G2): the overall banner + per-question affordances follow the
 * template's OWN scoring shape — countAchieved + real tiers + checkmarks
 * (Rockefeller); neutral "Submitted" + ratings (QSP/LVA); ScaleUp ring +
 * domain-colored cards + recommendations (SU Full). Domain colors via H12.
 * Everything degrades gracefully (H10): the frozen result + version JSON are
 * treated as untrusted at render time — missing labels show the stableKey,
 * malformed/partial data never crashes the page.
 *
 * Brand scope (ADR-0005): the root is wrapped in `.su-public-brand .su-report`
 * so the detailed report CSS (Task 3) is fully scoped. Detailed report styling
 * lands later; here we use semantic classes + the shared brand classes.
 *
 * Refs:
 *  - /tmp/su-assessment-mockups/report.html (approved visual anatomy)
 *  - docs/specs/v7.6/13-assessment-brand-and-results-report.md
 */

import type {
  RespondentReport,
  QuestionMeta,
} from "@/lib/assessments/respondent-report";
import type {
  ScoreResult,
  PerQuestionResult,
  PerSectionResult,
} from "@/lib/assessments/scoring";
import {
  isNeutralTier,
  domainColor,
  headlineForTierMetric,
} from "@/lib/assessments/report-presentation";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";

const LOGO_SRC = "/brand/su-logo-white.svg";

// WCAG-AA contrast-safe text colors for the per-decision average numerals.
// Bright domain colors (People #f7a600 = 2.02:1, Cash #95c11f = 2.12:1) fail
// the 3.0:1 large-text threshold on white. Use darkened variants per mockup.
const DOMAIN_TEXT_COLOR: Record<string, string> = {
  people: "#946b36",    // darkened from #f7a600
  strategy: "#008bd2",  // already passes (~3.5:1)
  execution: "#946b36", // already the stripe color — passes
  cash: "#6f9200",      // darkened from #95c11f
};

// ── Defensive view of the raw version `sections` JSON ──────────────────────
// Sections are stored as a flat JSON array of { stableKey, name, domain? }.
// Some shapes (and the report fixtures) additionally nest the section's
// question keys under `questions: [{ stableKey }]`, which lets us group the
// per-question rows by section. We read whatever is present and degrade.

interface ParsedSection {
  stableKey: string;
  name: string;
  domain?: string;
  questionKeys: string[];
}

function parseSections(raw: unknown): ParsedSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedSection[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    if (typeof obj.stableKey !== "string") continue;
    const questionKeys: string[] = [];
    if (Array.isArray(obj.questions)) {
      for (const q of obj.questions) {
        if (q && typeof q === "object") {
          const qk = (q as Record<string, unknown>).stableKey;
          if (typeof qk === "string") questionKeys.push(qk);
        } else if (typeof q === "string") {
          questionKeys.push(q);
        }
      }
    }
    out.push({
      stableKey: obj.stableKey,
      name: typeof obj.name === "string" ? obj.name : obj.stableKey,
      domain: typeof obj.domain === "string" ? obj.domain : undefined,
      questionKeys,
    });
  }
  return out;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatSubmittedAt(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return String(d);
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 100) / 100).toString();
}

function stringifyAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/** Normalize raw answers (JSON) to a [stableKey → value] list, total-tolerant. */
function parseRawAnswers(raw: unknown): Array<{ stableKey: string; value: unknown }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ stableKey: string; value: unknown }> = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const obj = a as Record<string, unknown>;
    if (typeof obj.stableKey !== "string") continue;
    out.push({ stableKey: obj.stableKey, value: obj.value });
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────

export interface BrandedReportProps {
  report: RespondentReport;
  /** Optional override; falls back to report.assessmentName. */
  assessmentName?: string;
  /** Optional override; falls back to report.campaignLabel. */
  campaignLabel?: string | null;
}

export function BrandedReport({ report, assessmentName, campaignLabel }: BrandedReportProps) {
  // Qualitative templates (LVA / QSP) get a wholly different per-respondent
  // renderer — their answers are mostly free-text/metrics, not scored items.
  // The scored anatomy below is unchanged for default/scored templates.
  if (reportConfigFor(report.templateAlias).reportType === "qualitative") {
    return <QualitativeReport report={report} />;
  }

  const result: ScoreResult = report.result ?? ({} as ScoreResult);
  const perQuestion: PerQuestionResult[] = Array.isArray(result.perQuestion)
    ? result.perQuestion
    : [];
  const perSection: PerSectionResult[] = Array.isArray(result.perSection)
    ? result.perSection
    : [];
  const perDomain = Array.isArray(result.perDomain) ? result.perDomain : null;

  const title = assessmentName ?? report.assessmentName;
  // Show the coach's campaign label as a subtitle ONLY when it differs from the title.
  const resolvedCampaignLabel =
    campaignLabel !== undefined ? campaignLabel : report.campaignLabel ?? null;
  const showCampaignSubtitle =
    !!resolvedCampaignLabel && resolvedCampaignLabel !== title;

  const sections = parseSections(report.sections);
  const sectionByKey = new Map<string, ParsedSection>();
  for (const s of sections) sectionByKey.set(s.stableKey, s);

  // Domain coloring applies ONLY when the template defines domains (perDomain).
  const useDomainColors = !!perDomain;

  // Scoring shape adaptation.
  const scoringConfig = report.scoringConfig;
  const cfg =
    scoringConfig && typeof scoringConfig === "object"
      ? (scoringConfig as Record<string, unknown>)
      : {};
  const passThreshold =
    typeof cfg.passThreshold === "number" ? cfg.passThreshold : 0;
  const showCheckmarks = passThreshold > 0; // G2
  // H11 neutral display = single neutral tier AND no ScaleUp headline. SU Full
  // matches the neutral *tier* shape (1 tier, passThreshold 0, overallAvg) but
  // is NOT a neutral report: its ScaleUp score is the real headline, so it
  // keeps its band label rather than collapsing to "Submitted".
  const hasScaleUpScore = typeof result.scaleUpScore === "number";
  const neutral = isNeutralTier(scoringConfig) && !hasScaleUpScore; // H11
  const headline = headlineForTierMetric(result, scoringConfig); // G2
  // SU Full has no tier band (ADR-0015): Esperto shows none and we can't compute
  // its percentile, so standing is expressed as peer-deviation in the group
  // report — not a LOW/GOOD/TOP band here. report-config keys this off the alias.
  // The ScaleUp score ring/number still renders; only the band + tier message
  // are suppressed when showTier is false.
  const showTier = reportConfigFor(report.templateAlias).showTier;

  // Per-question lookups.
  const pqByKey = new Map<string, PerQuestionResult>();
  for (const pq of perQuestion) pqByKey.set(pq.stableKey, pq);

  function labelFor(key: string): { label: string; unmapped: boolean } {
    const lbl = report.questionByKey?.[key];
    if (lbl && lbl.trim() !== "") return { label: lbl, unmapped: false };
    return { label: key, unmapped: true };
  }

  // ── Section breakdown: group per-question rows under their section ────────
  // Primary source: questionsByKey[key].sectionStableKey → group by that value.
  // Fallback (when sectionStableKey absent on a question): parsed section's
  // questionKeys list from version.sections[].questions.
  // perQuestion entries with no known section fall into an "Other" bucket.

  // Build sectionStableKey → set of question keys from questionsByKey meta.
  const qKeysBySection = new Map<string, Set<string>>();
  for (const pq of perQuestion) {
    const meta = report.questionsByKey?.[pq.stableKey];
    if (meta?.sectionStableKey) {
      const s = qKeysBySection.get(meta.sectionStableKey) ?? new Set<string>();
      s.add(pq.stableKey);
      qKeysBySection.set(meta.sectionStableKey, s);
    }
  }
  // Whether any question has sectionStableKey populated at all.
  const hasSectionMeta = qKeysBySection.size > 0;

  const assignedQuestionKeys = new Set<string>();
  const sectionCards = perSection.map((ps) => {
    const parsed = sectionByKey.get(ps.stableKey);
    // Use sectionStableKey-based grouping when available; fall back to
    // parsed section's embedded questionKeys list.
    const qKeys: string[] = hasSectionMeta
      ? Array.from(qKeysBySection.get(ps.stableKey) ?? [])
      : (parsed?.questionKeys ?? []);
    const rows = qKeys
      .map((qk) => {
        assignedQuestionKeys.add(qk);
        return pqByKey.get(qk);
      })
      .filter((pq): pq is PerQuestionResult => !!pq);
    const domain = parsed?.domain;
    const headColor = useDomainColors && domain ? domainColor(domain) : null;
    return { ps, parsed, rows, headColor };
  });

  // Any per-question rows not claimed by a section → render flat at the end.
  const orphanRows = perQuestion.filter(
    (pq) => !assignedQuestionKeys.has(pq.stableKey),
  );

  // ── Per-decision domain cards (only when the template defines domains) ────
  // Esperto/4-Decisions anatomy: a colored card per decision with its average,
  // a fill bar, and the total points. Domains roll up on a 0–10 item scale, so
  // the bar width is avg/10 (clamped). Skipped entirely for non-domain
  // templates (the neutral path renders no cards section).
  const domainCards = (perDomain ?? []).map((d) => {
    const color = domainColor(d.key);
    const avg = typeof d.averagePoints === "number" ? d.averagePoints : null;
    const pct = avg === null ? 0 : Math.max(0, Math.min(100, avg * 10));
    // Total points for this domain = sum of its sections' totalPoints, matched
    // by the section's parsed domain.
    let points = 0;
    for (const sc of sectionCards) {
      if (sc.parsed?.domain && sc.parsed.domain.toLowerCase().trim() === d.key.toLowerCase().trim()) {
        points += Number.isFinite(sc.ps.totalPoints) ? sc.ps.totalPoints : 0;
      }
    }
    return { key: d.key, label: d.label || d.key, color, avg, pct, points };
  });
  const hasDomainCards = domainCards.length > 0;

  // ── Recommendations grouped by section (only non-empty) ──────────────────
  const recSections = sectionCards
    .map(({ ps, rows }) => ({
      name: ps.name,
      recs: rows
        .filter((r) => r.recommendation && r.recommendation.trim() !== "")
        .map((r) => ({ key: r.stableKey, text: r.recommendation as string })),
    }))
    .filter((g) => g.recs.length > 0);
  // include orphan recommendations under a generic group
  const orphanRecs = orphanRows
    .filter((r) => r.recommendation && r.recommendation.trim() !== "")
    .map((r) => ({ key: r.stableKey, text: r.recommendation as string }));
  if (orphanRecs.length > 0) {
    recSections.push({ name: "Recommendations", recs: orphanRecs });
  }
  const hasRecommendations = recSections.length > 0;

  // ── Additional (non-slider) responses (H9) ───────────────────────────────
  const rawAnswers = parseRawAnswers(report.rawAnswers);
  const additional = rawAnswers
    .map((a) => {
      const meta: QuestionMeta | undefined = report.questionsByKey?.[a.stableKey];
      return { stableKey: a.stableKey, value: a.value, meta };
    })
    .filter((a) => a.meta && a.meta.type !== "SLIDER_LIKERT");
  const hasAdditional = additional.length > 0;

  return (
    <div className="su-public-brand su-report" data-testid="branded-report">
      {report.degraded && (
        <div
          className="su-report-degraded"
          role="status"
          data-testid="report-degraded-notice"
        >
          Some scoring details for this submission could not be fully read.
          The report below shows everything that is available.
        </div>
      )}

      {/* ── 1. Cover ─────────────────────────────────────────────────────── */}
      <section className="su-report-cover" data-testid="report-cover">
        <div className="su-stripe-h" />
        <div className="su-report-cover-inner">
          <div className="su-brandbar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="su-logo"
              src={LOGO_SRC}
              alt="Scaling Up"
              width={180}
              height={24}
            />
          </div>
          <h1 className="su-h1 su-report-title">{title}</h1>
          {showCampaignSubtitle && (
            <p
              className="su-report-campaign-label"
              data-testid="report-campaign-label"
            >
              {resolvedCampaignLabel}
            </p>
          )}
          <div className="su-report-cover-meta">
            <div className="su-report-for">
              Report for: {report.respondentName}
              {report.jobTitle ? ` · ${report.jobTitle}` : ""}
            </div>
            <div className="su-report-sub">
              {report.companyName} · {formatSubmittedAt(report.submittedAt)}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Overall ──────────────────────────────────────────────────── */}
      <section className="su-report-overall" data-testid="report-overall">
        <div className="su-report-eyebrow">Overall result</div>
        {/* sr-only: announce score + band to screen readers before the decorative ring */}
        <span className="sr-only">
          {neutral
            ? "Submitted"
            : `Overall score: ${headline.primary}${showTier && headline.label ? `, ${headline.label}` : ""}`}
        </span>
        <div className="su-report-overall-main">
          {/* aria-hidden: the ring is decorative — the score is in the sr-only span above */}
          <div className="su-report-ringwrap" aria-hidden="true">
            {/* Split "58 / 100" → big number + small denominator to avoid crowding */}
            {(() => {
              const slashIdx = headline.primary.indexOf("/");
              if (!neutral && slashIdx !== -1) {
                const num = headline.primary.slice(0, slashIdx).trim();
                const den = headline.primary.slice(slashIdx).trim();
                return (
                  <>
                    <div className="su-report-headline su-report-headline-num">{num}</div>
                    <div className="su-report-headline-den">{den}</div>
                  </>
                );
              }
              return <div className="su-report-headline">{headline.primary}</div>;
            })()}
          </div>
          <div className="su-report-overall-text">
            {neutral ? (
              <div className="su-report-status">Submitted</div>
            ) : (
              showTier &&
              headline.label && (
                <div className="su-report-band" data-testid="overall-band">
                  {headline.label}
                </div>
              )
            )}
            {showTier && !neutral && result.tier?.message && (
              <p className="su-report-lede">{result.tier.message}</p>
            )}
          </div>
        </div>
        {/* small stats row */}
        <div className="su-report-stats">
          <div className="su-report-stat">
            <span className="su-report-stat-v">
              {formatNumber(result.overallTotal ?? 0)}
            </span>
            <span className="su-report-stat-l">Total points</span>
          </div>
          <div className="su-report-stat">
            <span className="su-report-stat-v">
              {formatNumber(result.overallAverage ?? 0)}
            </span>
            <span className="su-report-stat-l">Average per item</span>
          </div>
          <div className="su-report-stat">
            <span className="su-report-stat-v">{perSection.length}</span>
            <span className="su-report-stat-l">Sections</span>
          </div>
        </div>
      </section>

      {/* ── 2b. Per-decision cards (domain templates only) ──────────────── */}
      {hasDomainCards && (
        <section className="su-report-decisions" data-testid="report-decisions">
          <div className="su-report-eyebrow">How you scored, by decision</div>
          <h2 className="su-h2 su-report-sec-title">Your Four Decisions</h2>
          <div className="su-report-card-grid">
            {domainCards.map((d) => (
              <div
                className="su-report-decision-card"
                key={d.key}
                data-testid={`decision-card-${d.key}`}
                style={{ borderLeftColor: d.color }}
              >
                <div className="su-report-decision-head">
                  <span className="su-report-decision-name">{d.label}</span>
                  <span
                    className="su-report-decision-avg"
                    style={{
                      color: DOMAIN_TEXT_COLOR[d.key.toLowerCase()] ?? d.color,
                    }}
                  >
                    {d.avg === null ? "—" : formatNumber(d.avg)}
                  </span>
                </div>
                <div className="su-report-decision-bar">
                  <i style={{ width: `${d.pct}%`, backgroundColor: d.color }} />
                </div>
                <div className="su-report-decision-sub">
                  {formatNumber(d.points)} points
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. Section breakdown ────────────────────────────────────────── */}
      <section className="su-report-sections" data-testid="report-sections">
        <div className="su-report-eyebrow">Detailed breakdown</div>
        <h2 className="su-h2 su-report-sec-title">How you scored, section by section</h2>
        <div className="su-report-grid">
          {sectionCards.map(({ ps, parsed, rows, headColor }) => {
            const headStyle = headColor
              ? { backgroundColor: headColor }
              : undefined;
            return (
              <div className="su-report-card" key={ps.stableKey}>
                <div
                  className="su-report-card-head"
                  data-testid={`section-head-${ps.stableKey}`}
                  style={headStyle}
                >
                  {headColor && (
                    <span
                      data-testid="domain-colored-head"
                      aria-hidden="true"
                      style={{ display: "none" }}
                    />
                  )}
                  <h3 className="su-report-card-title">
                    {parsed?.name ?? ps.name ?? ps.stableKey}
                  </h3>
                  {showCheckmarks && (
                    <span className="su-report-card-chip">
                      {ps.achievedCount} / {ps.totalCount}
                    </span>
                  )}
                </div>
                <ul className="su-report-card-list">
                  {rows.length === 0 ? (
                    <li className="su-report-card-empty">
                      No per-question detail for this section.
                    </li>
                  ) : (
                    rows.map((r) => {
                      const { label, unmapped } = labelFor(r.stableKey);
                      return (
                        <li className="su-report-q" key={r.stableKey}>
                          {showCheckmarks && (
                            <span
                              className={
                                r.achieved
                                  ? "su-report-ck yes"
                                  : "su-report-ck no"
                              }
                              data-testid="achieved-marker"
                              aria-label={
                                r.achieved ? "achieved" : "not achieved"
                              }
                            >
                              {r.achieved ? "✓" : "✕"}
                            </span>
                          )}
                          <span className="su-report-q-label">
                            {label}
                            {unmapped && (
                              <span className="su-report-unmapped">
                                {" "}
                                (unmapped)
                              </span>
                            )}
                          </span>
                          <span className="su-report-q-rate">
                            {(() => {
                              const qmax = report.questionsByKey?.[r.stableKey]?.max;
                              return qmax !== undefined
                                ? `${r.value} / ${qmax}`
                                : r.value;
                            })()}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        {orphanRows.length > 0 && (
          <ul className="su-report-orphan-list">
            {orphanRows.map((r) => {
              const { label, unmapped } = labelFor(r.stableKey);
              return (
                <li className="su-report-q" key={r.stableKey}>
                  {showCheckmarks && (
                    <span
                      className={r.achieved ? "su-report-ck yes" : "su-report-ck no"}
                      data-testid="achieved-marker"
                      aria-label={r.achieved ? "achieved" : "not achieved"}
                    >
                      {r.achieved ? "✓" : "✕"}
                    </span>
                  )}
                  <span className="su-report-q-label">
                    {label}
                    {unmapped && (
                      <span className="su-report-unmapped"> (unmapped)</span>
                    )}
                  </span>
                  <span className="su-report-q-rate">
                    {(() => {
                      const qmax = report.questionsByKey?.[r.stableKey]?.max;
                      return qmax !== undefined ? `${r.value} / ${qmax}` : r.value;
                    })()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 4. Scores table (G3 — no team average; #24 — gated by report-config) ── */}
      {reportConfigFor(report.templateAlias).showScoreTable && (
      <section className="su-report-scores">
        <div className="su-report-eyebrow">Score summary</div>
        <h2 className="su-h2 su-report-sec-title">All sections</h2>
        <table className="su-report-table" data-testid="report-scores-table">
          <thead>
            <tr>
              <th>Section</th>
              <th className="su-report-num">Your score</th>
              <th className="su-report-num">Your average</th>
            </tr>
          </thead>
          <tbody>
            {perSection.map((ps) => {
              const parsed = sectionByKey.get(ps.stableKey);
              const dot =
                useDomainColors && parsed?.domain
                  ? domainColor(parsed.domain)
                  : null;
              return (
                <tr key={ps.stableKey}>
                  <td>
                    {dot && (
                      <span
                        className="su-report-dot"
                        style={{ backgroundColor: dot }}
                        aria-hidden="true"
                      />
                    )}
                    {parsed?.name ?? ps.name ?? ps.stableKey}
                  </td>
                  <td className="su-report-num su-report-score">
                    {formatNumber(ps.totalPoints)}
                  </td>
                  <td className="su-report-num su-report-avg">
                    {formatNumber(ps.averagePoints)}
                  </td>
                </tr>
              );
            })}
            <tr className="su-report-total">
              <td>Total</td>
              <td className="su-report-num su-report-score">
                {formatNumber(result.overallTotal ?? 0)}
              </td>
              <td className="su-report-num su-report-avg">
                {formatNumber(result.overallAverage ?? 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      )}

      {/* ── 5. Recommendations (only when present) ──────────────────────── */}
      {hasRecommendations && (
        <section
          className="su-report-recs"
          data-testid="report-recommendations"
        >
          <div className="su-report-eyebrow">What to work on next</div>
          <h2 className="su-h2 su-report-sec-title">Your recommendations</h2>
          {recSections.map((g) => (
            <div className="su-report-rec-group" key={g.name}>
              <h3 className="su-report-rec-section">{g.name}</h3>
              {g.recs.map((rec) => (
                <div className="su-report-rec" key={rec.key}>
                  <p>{rec.text}</p>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* ── 6. Additional (non-slider) responses (H9) ───────────────────── */}
      {hasAdditional && (
        <section className="su-report-additional" data-testid="report-additional">
          <div className="su-report-eyebrow">Additional responses</div>
          <h2 className="su-h2 su-report-sec-title">Your other answers</h2>
          <dl className="su-report-dl">
            {additional.map((a) => (
              <div className="su-report-dl-row" key={a.stableKey}>
                <dt className="su-report-dl-q">
                  {a.meta?.label ?? a.stableKey}
                </dt>
                <dd className="su-report-dl-a">{stringifyAnswer(a.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── 7. Conclusion ───────────────────────────────────────────────── */}
      <section className="su-report-conclusion" data-testid="report-conclusion">
        <h3 className="su-h2 su-report-conclude-title">
          Keep Scaling, {report.respondentName.split(" ")[0]}.
        </h3>
        <p>
          You&apos;ve completed your assessment. Turn these results into a
          90-day plan with your coach.
        </p>
        {/* CTA: link to the referring coach via mailto, or fall back to the
            Scaling Up coaches directory. Never crashes when coach is absent. */}
        <a
          className="su-report-cta"
          href={
            report.referringCoachEmail
              ? `mailto:${report.referringCoachEmail}`
              : "https://scalingup.com/coaches"
          }
        >
          Talk to your Scaling Up Certified Coach →
        </a>
      </section>

      {/* ── 8. Footer ───────────────────────────────────────────────────── */}
      <footer className="su-report-footer" data-testid="report-footer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="su-logo"
          src={LOGO_SRC}
          alt="Scaling Up"
          width={120}
          height={22}
        />
        <span className="su-report-submitted-date">
          {formatSubmittedAt(report.submittedAt)}
        </span>
        <span className="su-report-confidential">
          Generated by Scaling Up Platform
        </span>
      </footer>
    </div>
  );
}

export default BrandedReport;
