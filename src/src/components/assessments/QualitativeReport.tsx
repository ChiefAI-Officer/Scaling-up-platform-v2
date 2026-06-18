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
import {
  buildQualitativeModel,
  type QualItem,
  type QualSection,
} from "@/lib/assessments/qualitative-report-model";

const LOGO_SRC = "/brand/su-logo-white.svg";

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

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return "there";
  return trimmed.split(/\s+/)[0];
}

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
            {otherItems.map((item) => (
              <tr
                key={item.stableKey}
                data-testid={`qual-item-${item.stableKey}`}
              >
                <td className="su-stmt-label">{item.label}</td>
                <td className="su-stmt-rate">
                  <span>{itemText(item)}</span>
                </td>
              </tr>
            ))}
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

export function QualitativeReport({ report }: { report: RespondentReport }) {
  const model = buildQualitativeModel({
    templateAlias: report.templateAlias,
    sections: report.sections,
    questionsByKey: report.questionsByKey,
    rawAnswers: report.rawAnswers,
  });

  const who = attribution(report.respondentName, report.jobTitle);
  const firstName = firstNameOf(report.respondentName);
  const submitted = formatSubmittedAt(report.submittedAt);

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
      {model.sections.map((section) => (
        <section
          className="su-section"
          key={section.stableKey}
          data-testid={`qual-section-${section.stableKey}`}
        >
          <h2 className="su-section-title su-h2">{section.name}</h2>
          {section.description && (
            <p className="su-section-intro">{section.description}</p>
          )}
          <SectionBody section={section} who={who} />
        </section>
      ))}

      {/* ── 4. Footer (matches the cleaned BrandedReport footer) ───────────── */}
      <footer className="su-report-footer" data-testid="report-footer">
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
