/**
 * Assessment v7.6 Wave E — QualitativeReport (Task 10).
 *
 * The on-screen / PDF qualitative-report renderer (LVA + QSP). Pure
 * presentational: it consumes a frozen RespondentReport (loaded + authorized
 * upstream), shapes it via the SHARED `buildQualitativeModel` data layer, and
 * renders the approved Esperto-style anatomy from the sign-off mockup
 * (src/public/wireframes-phase2/wave-e-qualitative-report-mockup.html):
 *
 *   cover → text-only preface → per-section blocks → footer
 *
 * PER-RESPONDENT ONLY — the respondent's own answers, organized by theme.
 * There is NO score ring, NO overall total, and NO team "Mean" column anywhere.
 *
 * Each QualSection is rendered per its presentation `kind`:
 *   - metric-table → numeric metrics, ONE respondent column (LVA financials)
 *   - qa           → blue question heading + free-text answer beneath
 *   - rating       → 1–3 Weak/Average/Strong matrix, or 1–N statement table
 *   - percent-bar  → a single percentage as a fill bar (rehire %)
 *   - choices      → flagged factors + their explanations (Esperto amber Q&A)
 * A `qa`/mixed section that contains a lone percent NUMBER item renders that
 * item inline as a bar (matching the mockup's rehire-% block).
 *
 * Brand scope (ADR-0005): the root is wrapped in `.su-public-brand .su-report`
 * so the qualitative CSS in su-report.css is fully scoped. React auto-escapes
 * all text — respondent answers are never injected as raw HTML.
 */

import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { greetingName } from "@/lib/assessments/respondent-display-name";
import {
  buildQualitativeModel,
  type QualItem,
  type QualSection,
} from "@/lib/assessments/qualitative-report-model";
import type { PeerComparisonSection } from "@/lib/assessments/peer-benchmarks";
import { peerDevGlyph, peerDevText } from "@/lib/assessments/lva-report-display";
import {
  parseResolvedFindings,
  buildFindingsSection,
  type FindingsSection,
} from "@/lib/assessments/findings-section-model";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";
import { CoachLogo } from "@/components/assessments/CoachLogo";
import { Fragment } from "react";

const LOGO_SRC = "/brand/su-logo-white.svg";

/**
 * Wave S (D13) — where the peer-comparison section splices in: the index of
 * the S4_obstacles section (peers render immediately BEFORE it, i.e. in the
 * suppressed S3 section's natural slot), or -1 when no S4 section exists in
 * this pinned version (callers then append the block after the last section).
 */
function peerSliceIndex(sections: readonly QualSection[]): number {
  return sections.findIndex((s) => s.stableKey === "S4_obstacles");
}

/**
 * Wave S (Jeff #12/#13) — the individual "compared to peers" section: the
 * respondent's own S3 rating per factor (0/5/10 on the shared 0–10 axis) next
 * to the admin-set peer average, with the shared ▲/▼/● deviation treatment
 * (peerDevGlyph/peerDevText — same helpers as the group rating rows, so the
 * two surfaces can never drift). Renders ONLY via the optional prop below;
 * classes styled in su-report.css (`.su-peer-*`, print break-inside: avoid).
 */
function PeerComparisonBlock({ section }: { section: PeerComparisonSection }) {
  return (
    <section
      className="su-section su-peer-section"
      data-testid="qual-section-peer-comparison"
    >
      <h2 className="su-section-title su-h2">{section.title}</h2>
      <p className="su-section-intro">{section.intro}</p>
      <table className="su-peer-table">
        <thead>
          <tr>
            <th className="su-peer-th su-peer-th-factor">Factor</th>
            <th className="su-peer-th">Your rating</th>
            <th className="su-peer-th">Peers</th>
            <th className="su-peer-th">Difference</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => (
            <tr
              key={item.stableKey}
              data-testid={`peer-comparison-row-${item.stableKey}`}
            >
              <td className="su-peer-factor">{item.label}</td>
              <td className="su-peer-own">
                {item.ownRating}{" "}
                <span className="su-peer-own-val">
                  ({item.ownValue.toFixed(1)})
                </span>
              </td>
              <td className="su-peer-peers">{item.peers.toFixed(1)}</td>
              {/* `neg` styled in su-report.css — the report route loads no
                  Tailwind, so utility classes would silently no-op here. */}
              <td
                className={item.dev < 0 ? "su-peer-dev neg" : "su-peer-dev"}
                data-testid={`peer-comparison-dev-${item.stableKey}`}
              >
                <span aria-hidden="true">{peerDevGlyph(item.dev)}</span>{" "}
                {peerDevText(item.dev)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Wave U (spec 19u U-5) — the consolidated findings section: the frozen
 * `result.findings` snapshot grouped by survey section, with the scored
 * report's parity copy ("What to work on next" / "Your recommendations")
 * and its `.su-report-rec*` classes (styled + print-safe in su-report.css,
 * shared with BrandedReport's recommendations block — the two surfaces
 * cannot drift). Renders ONLY when the flag is on AND rules fired.
 */
function FindingsBlock({ section }: { section: FindingsSection }) {
  return (
    <section
      className="su-section su-report-recs"
      data-testid="qual-section-findings"
    >
      <p className="su-section-eyebrow">{section.eyebrow}</p>
      <h2 className="su-section-title su-h2">{section.title}</h2>
      {section.groups.map((group, gi) => (
        <div
          className="su-report-rec-group"
          key={group.sectionName ?? `unnamed-${gi}`}
        >
          {group.sectionName && (
            <h3 className="su-report-rec-section">{group.sectionName}</h3>
          )}
          {group.items.map((item, ii) => (
            <div
              className="su-report-rec"
              key={`${item.stableKey}#${ii}`}
              data-testid={`qual-finding-${item.stableKey}`}
            >
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Greeting derivation is shared (Wave P, Jeff #5): greetingName degrades to
// "there" for blank values AND for email addresses — respondentName may be
// the email fallback when the roster name is blank, and an email must never
// appear in a "Dear …" greeting.

/** Render the respondent's value as display text (arrays join with commas). */
function answerText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Display text for an item. Prefers the model's resolved `displayValues`
 * (MULTI_CHOICE option labels) so stored keys never reach the screen (C-H1);
 * falls back to the raw value for every other type. Renderers stay dumb — the
 * key→label resolution happens in buildQualitativeModel, not here.
 */
function itemText(item: QualItem): string {
  if (item.displayValues) return item.displayValues.join(", ");
  return answerText(item.value);
}

/** Who answered — "{name} ({role})" when a role is known, else just the name. */
function attribution(name: string, role: string | null): string {
  return role && role.trim() !== "" ? `${name} (${role})` : name;
}

/** Is this item a percentage NUMBER (0–100 scale)? Drives inline bar rendering. */
function isPercentItem(item: QualItem): boolean {
  return (
    item.type === "NUMBER" &&
    typeof item.value === "number" &&
    item.min === 0 &&
    item.max === 100
  );
}

/** Map a 1–3 slider value to the Weak/Average/Strong vocabulary + tone class. */
const STRENGTH_BUCKETS = ["weak", "avg", "strong"] as const;
const STRENGTH_LABELS = ["Weak", "Average", "Strong"] as const;

// ── Per-kind blocks ────────────────────────────────────────────────────────

function MetricTable({ who, items }: { who: string; items: QualItem[] }) {
  return (
    <table className="su-metric-table">
      <thead>
        <tr>
          <th className="lbl">Metric</th>
          <th>{who}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.stableKey} data-testid={`qual-item-${item.stableKey}`}>
            <td className="su-metric-label">{item.label}</td>
            <td className="su-metric-val">{itemText(item)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PercentBar({ who, item }: { who: string; item: QualItem }) {
  const raw = typeof item.value === "number" ? item.value : 0;
  const pct = Math.max(0, Math.min(100, raw));
  return (
    <div className="su-barwrap" data-testid={`qual-item-${item.stableKey}`}>
      <span className="su-bar-who">{who}</span>
      <div className="su-bar-row">
        <div className="su-bar-track">
          <div className="su-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="su-bar-val">{answerText(item.value)}%</span>
      </div>
    </div>
  );
}

function QaRow({
  who,
  item,
  amber,
}: {
  who: string;
  item: QualItem;
  amber?: boolean;
}) {
  // A lone percent NUMBER inside a Q&A/choices section renders as a bar inline.
  if (isPercentItem(item)) {
    return (
      <div className="su-qa">
        <p className="su-qa-q">{item.label}</p>
        <PercentBar who={who} item={item} />
      </div>
    );
  }
  return (
    <div
      className={amber ? "su-qa amber" : "su-qa"}
      data-testid={`qual-item-${item.stableKey}`}
    >
      <p className="su-qa-q">{item.label}</p>
      <div className="su-qa-a">
        <span className="su-qa-who">{who}</span>
        <div className="su-qa-text">{itemText(item)}</div>
      </div>
    </div>
  );
}

function RatingBlock({ who, items }: { who: string; items: QualItem[] }) {
  // 1–3 sliders → Weak/Average/Strong matrix; otherwise a statement table (1–N).
  const matrixItems = items.filter(
    (i) => i.type === "SLIDER_LIKERT" && i.min === 1 && i.max === 3,
  );
  const otherItems = items.filter((i) => !matrixItems.includes(i));

  return (
    <>
      {matrixItems.length > 0 && (
        <div className="su-matrix">
          <div className="su-matrix-row su-matrix-head">
            <div className="su-matrix-cell">Factor</div>
            {STRENGTH_LABELS.map((label) => (
              <div
                key={label}
                className="su-matrix-cell"
                style={{ justifyContent: "center" }}
              >
                {label}
              </div>
            ))}
          </div>
          {matrixItems.map((item) => {
            const picked =
              typeof item.value === "number"
                ? Math.round(item.value) - 1
                : -1;
            return (
              <div
                className="su-matrix-row"
                key={item.stableKey}
                data-testid={`qual-item-${item.stableKey}`}
              >
                <div className="su-matrix-cell factor">{item.label}</div>
                {STRENGTH_LABELS.map((label, idx) => {
                  const isPicked = idx === picked;
                  const cls = isPicked
                    ? `su-matrix-cell rating picked ${STRENGTH_BUCKETS[idx]}`
                    : "su-matrix-cell rating";
                  return (
                    <div key={label} className={cls}>
                      {label}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {otherItems.length > 0 && (
        <table className="su-stmt-table">
          <thead>
            <tr>
              <th className="lbl">Statement</th>
              <th>{who}</th>
            </tr>
          </thead>
          <tbody>
            {otherItems.map((item) =>
              /* Wave R (R-2b, Jeff #4): free-form TEXT answers get a full-width
                 row — question on its own line, answer below — instead of being
                 squeezed into the narrow rating column. Order is preserved. */
              item.type === "TEXT" ? (
                <tr
                  key={item.stableKey}
                  data-testid={`qual-item-${item.stableKey}`}
                >
                  <td className="su-stmt-text" colSpan={2}>
                    <div className="su-stmt-text-q">{item.label}</div>
                    <div className="su-stmt-text-a">{itemText(item)}</div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={item.stableKey}
                  data-testid={`qual-item-${item.stableKey}`}
                >
                  <td className="su-stmt-label">{item.label}</td>
                  <td className="su-stmt-rate">
                    <span>{itemText(item)}</span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

function SectionBody({ section, who }: { section: QualSection; who: string }) {
  switch (section.kind) {
    case "metric-table":
      return <MetricTable who={who} items={section.items} />;
    case "percent-bar":
      return (
        <>
          {section.items.map((item) => (
            <PercentBar key={item.stableKey} who={who} item={item} />
          ))}
        </>
      );
    case "rating":
      return <RatingBlock who={who} items={section.items} />;
    case "choices":
      // Flagged factors + their follow-up explanations (Esperto amber Q&A).
      return (
        <>
          {section.items.map((item) => (
            <QaRow key={item.stableKey} who={who} item={item} amber />
          ))}
        </>
      );
    case "qa":
    default:
      return (
        <>
          {section.items.map((item) => (
            <QaRow key={item.stableKey} who={who} item={item} />
          ))}
        </>
      );
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function QualitativeReport({
  report,
  peerComparison,
}: {
  report: RespondentReport;
  /**
   * Wave S (Jeff #12/#13) — the OPTIONAL "compared to peers" section, built
   * server-side by `buildPeerComparisonSection` (flag + render-enabled-alias
   * gated at the page). Absent/null ⇒ this component's output is byte-identical
   * to pre-Wave-S (the Esperto-faithful S3 suppression stays untouched). The
   * section is deliberately NOT part of `buildQualitativeModel` — that model is
   * shared with the respondent results email, which must never carry peers
   * (spec 19s D9).
   */
  peerComparison?: PeerComparisonSection | null;
}) {
  const model = buildQualitativeModel({
    templateAlias: report.templateAlias,
    sections: report.sections,
    questionsByKey: report.questionsByKey,
    rawAnswers: report.rawAnswers,
  });

  const who = attribution(report.respondentName, report.jobTitle);
  const firstName = greetingName(report.respondentName);
  const submitted = formatSubmittedAt(report.submittedAt);

  // Wave U — build the findings section from the frozen snapshot (total-
  // tolerant: absent/malformed → null → no section). Flag-gated at render.
  const findingsSection = isFindingsLogicEnabled()
    ? buildFindingsSection(
        parseResolvedFindings(
          (report.result as { findings?: unknown } | null | undefined)?.findings,
        ),
        report.sections,
      )
    : null;

  return (
    <div className="su-public-brand su-report" data-testid="qualitative-report">
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
            {/* Wave K: coach logo (Coach.profileImage); renders nothing when absent. */}
            <CoachLogo
              url={report.coachLogoUrl}
              name={report.coachName}
              variant="cover"
            />
          </div>
          <h1 className="su-h1 su-report-title">
            Your {report.assessmentName} Report
          </h1>
          <div className="su-report-cover-meta">
            <div className="su-report-for">
              {report.assessmentName} for: {report.respondentName}
              {report.jobTitle ? ` · ${report.jobTitle}` : ""}
            </div>
            <div className="su-report-sub">
              {report.companyName} · {submitted}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Preface (text-only — no photo / signature) ──────────────────── */}
      <section className="su-section su-preface" data-testid="qual-preface">
        <p className="su-section-eyebrow">Preface</p>
        <h2 className="su-section-title su-h2">Dear {firstName},</h2>
        <div className="su-preface-body">
          <p>
            This is your report from the {report.assessmentName}. It lists your
            own answers, organized by theme — great for preparing your strategy
            sessions and priority-making.
          </p>
          <p>We wish you many great insights.</p>
        </div>
      </section>

      {/* ── 3. Per-section blocks ──────────────────────────────────────────── */}
      {/* Wave S (D13): the peer-comparison section renders in S3's natural
          slot — immediately before S4_obstacles when that section is present
          in the model, else appended after the last section (spec 19s S-5). */}
      {model.sections.map((section, i) => (
        <Fragment key={section.stableKey}>
          {peerComparison && i === peerSliceIndex(model.sections) && (
            <PeerComparisonBlock section={peerComparison} />
          )}
          <section
            className="su-section"
            data-testid={`qual-section-${section.stableKey}`}
          >
            <h2 className="su-section-title su-h2">{section.name}</h2>
            {section.description && (
              <p className="su-section-intro">{section.description}</p>
            )}
            <SectionBody section={section} who={who} />
          </section>
        </Fragment>
      ))}
      {peerComparison && peerSliceIndex(model.sections) === -1 && (
        <PeerComparisonBlock section={peerComparison} />
      )}

      {/* Wave U (spec 19u U-5): the consolidated findings section — renders
          the frozen result.findings snapshot (ALL rule kinds on qualitative
          templates), appended after the last section. Flag OFF or empty
          snapshot → absent entirely (output byte-identical to pre-Wave-U).
          Deliberately NOT part of buildQualitativeModel — that model is
          shared with the respondent results email, which must never carry
          findings (D7; same isolation as Wave S peers). */}
      {findingsSection && <FindingsBlock section={findingsSection} />}

      {/* ── 4. Footer (matches the cleaned BrandedReport footer) ───────────── */}
      <footer className="su-report-footer" data-testid="report-footer">
        {/* Wave K: coach logo (left); renders nothing when absent. */}
        <CoachLogo
          url={report.coachLogoUrl}
          name={report.coachName}
          variant="footer"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="su-logo"
          src={LOGO_SRC}
          alt="Scaling Up"
          width={120}
          height={22}
        />
        <span className="su-report-submitted-date">{submitted}</span>
        <span className="su-report-confidential">
          Generated by Scaling Up Platform
        </span>
      </footer>
    </div>
  );
}

export default QualitativeReport;
