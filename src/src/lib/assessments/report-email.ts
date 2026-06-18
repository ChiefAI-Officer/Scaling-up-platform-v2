/**
 * Spec 16 §2 — Email-safe report HTML builder.
 *
 * buildReportEmailHtml({ report, recipientRole }) renders a frozen
 * RespondentReport into an inline-styled, **table-layout** HTML string that
 * survives email clients (Outlook/Gmail strip <style>/<link>, drop flex/grid,
 * and ignore many modern CSS features). The anatomy mirrors the approved
 * mockup (/tmp/su-report-mockup/index.html): cover → overall → per-decision
 * cards → score-summary table.
 *
 * Constraints:
 *  - PURE: no DB, no network, no React. Props in → { subject, bodyHtml } out.
 *  - EMAIL-SAFE: inline styles + <table> layout ONLY. No external CSS, no
 *    @import, no display:flex / display:grid.
 *  - SECURE: every interpolated value is HTML-escaped (escapeHtml).
 *  - ADAPTIVE: reuses report-presentation.ts for band/headline/domain-color so
 *    on-screen and email stay in lockstep. Degrades for neutral (no-domain)
 *    templates — falls back to per-section rows.
 *
 * The Quick Assessment ("4 Decisions") is Scaling Up's OWN content, so quoting
 * its statements/labels back to the taker is fine; we still escape every value
 * because campaign labels / names are user-controlled.
 */

import { escapeHtml } from "@/lib/templates/interpolate-content-html";

/** Strip control characters (C0 + C1) from a value that goes into a MIME subject
 *  line. Prevents header injection. Do NOT use escapeHtml here — subjects are
 *  plain-text MIME headers, not HTML. */
function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}
import type {
  RespondentReport,
} from "@/lib/assessments/respondent-report";
import type {
  ScoreResult,
  PerSectionResult,
  PerDomainResult,
  PerQuestionResult,
} from "@/lib/assessments/scoring";
import {
  isNeutralTier,
  domainColor,
  headlineForTierMetric,
} from "@/lib/assessments/report-presentation";
import { reportConfigFor } from "@/lib/assessments/report-config";

export type ReportEmailRecipientRole = "TAKER_COPY" | "REFERRING_COACH";

export interface BuildReportEmailArgs {
  report: RespondentReport;
  recipientRole: ReportEmailRecipientRole;
}

export interface ReportEmail {
  subject: string;
  bodyHtml: string;
}

// ── Server-side RespondentReport assembly (Spec 16 §3) ──────────────────────
//
// The PUBLIC quiz submit route already holds everything a RespondentReport
// needs (the frozen ScoreResult + the public taker + the published version's
// sections/questions/scoringConfig + the template name). It has no DB-loaded
// `respondent` relation (public takers are respondentId=null), so we build the
// report shape directly rather than calling getRespondentReport.
//
// This mirrors the shape the on-screen public-quiz-client builds for
// BrandedReport, so the email + on-screen views stay in lockstep.

export interface BuildRespondentReportArgs {
  result: ScoreResult;
  publicTaker: { firstName: string; lastName: string; email: string };
  assessmentName: string;
  /** The template's stable alias — drives reportConfigFor (scored vs qualitative). */
  templateAlias: string;
  campaignLabel: string | null;
  sections: unknown;
  questions: unknown;
  scoringConfig: unknown;
  /** The submitted answers (shape `{ stableKey, value }[]`) — the qualitative
   *  (LVA/QSP) report renders these back to the respondent. */
  rawAnswers: unknown;
  submittedAt: Date;
  submissionId: string;
  /** Optional: the coach who referred this taker. Wired into the CTA mailto link. */
  referringCoachEmail?: string | null;
}

interface RawReportQuestion {
  stableKey: string;
  label: string;
  type?: string;
  sectionStableKey?: string;
}

function isRawReportQuestion(v: unknown): v is RawReportQuestion {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.label === "string";
}

/**
 * Builds a RespondentReport from the data the public-quiz submit route already
 * has in hand — no DB round-trip. Pure. The result is shared by both report
 * emails (TAKER_COPY + REFERRING_COACH) so they are byte-identical.
 */
export function buildRespondentReportFromSubmission(
  args: BuildRespondentReportArgs,
): RespondentReport {
  const rawQuestions: unknown[] = Array.isArray(args.questions)
    ? args.questions
    : [];

  const questionByKey: Record<string, string> = {};
  const questionsByKey: Record<string, { type: string; label: string; sectionStableKey?: string }> = {};
  const seen = new Set<string>();
  for (const q of rawQuestions) {
    if (!isRawReportQuestion(q)) continue;
    if (seen.has(q.stableKey)) continue; // first-wins on duplicate
    seen.add(q.stableKey);
    questionByKey[q.stableKey] = q.label;
    const meta: { type: string; label: string; sectionStableKey?: string } = {
      type: typeof q.type === "string" ? q.type : "UNKNOWN",
      label: q.label,
    };
    if (typeof q.sectionStableKey === "string") {
      meta.sectionStableKey = q.sectionStableKey;
    }
    questionsByKey[q.stableKey] = meta;
  }

  const name = `${args.publicTaker.firstName.trim()} ${args.publicTaker.lastName.trim()}`.trim();

  return {
    respondentName: name,
    jobTitle: null,
    companyName: "",
    assessmentName: args.assessmentName,
    templateAlias: args.templateAlias,
    campaignLabel: args.campaignLabel,
    submittedAt: args.submittedAt,
    result: args.result,
    sections: args.sections,
    questionByKey,
    questionsByKey,
    rawAnswers: args.rawAnswers,
    scoringConfig: args.scoringConfig,
    provenance: {
      submissionId: args.submissionId,
      versionId: "",
      contentHash: "",
      templateName: args.assessmentName,
    },
    degraded: false,
    referringCoachEmail: args.referringCoachEmail ?? null,
  };
}

// ── Brand palette (mirrors su-public-brand.css; literal for inline styles) ──
const PURPLE = "#522583";
const PURPLE_DEEP = "#3d1a63";
const INK = "#2b2440";
const MUTED = "#6b6480";
const LINE = "#ece8f2";
const SOFT = "#faf8fd";
const PURPLE_TINT = "#f0e9fa";
const FONT =
  "'Helvetica Neue', Roboto, Arial, sans-serif";

// Four-Decisions stripe colors (mockup .stripe).
const D_PEOPLE = "#f7a600";
const D_STRATEGY = "#008bd2";
const D_EXECUTION = "#946b36";
const D_CASH = "#95c11f";

// WCAG-AA contrast-safe text overrides for the bright domain colors used as
// large text (22px bold) on white. #f7a600 (People) = 2.02:1, #95c11f (Cash) =
// 2.12:1 — both fail 3.0:1. Use darkened variants (same as approved mockup).
const DOMAIN_TEXT_COLOR: Record<string, string> = {
  people: "#946b36",    // darkened from #f7a600 — approved mockup color
  strategy: "#008bd2",  // passes 3.5:1 on white — keep as-is
  execution: "#946b36", // already the stripe color — passes
  cash: "#6f9200",      // darkened from #95c11f — approved mockup color
};

// ── Defensive section parsing (mirrors BrandedReport.parseSections) ─────────

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
    // Question keys for the detailed-breakdown grouping (mirrors BrandedReport).
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

// ── Number formatting (mirrors BrandedReport.formatNumber) ──────────────────

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 100) / 100).toString();
}

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

function firstName(full: string): string {
  const trimmed = full.trim();
  if (trimmed === "") return "there";
  return trimmed.split(/\s+/)[0];
}

// ── Builder ──────────────────────────────────────────────────────────────

export function buildReportEmailHtml({
  report,
  recipientRole,
}: BuildReportEmailArgs): ReportEmail {
  const result: ScoreResult = report.result ?? ({} as ScoreResult);
  const perSection: PerSectionResult[] = Array.isArray(result.perSection)
    ? result.perSection
    : [];
  const perDomain: PerDomainResult[] | null = Array.isArray(result.perDomain)
    ? result.perDomain
    : null;
  const perQuestion: PerQuestionResult[] = Array.isArray(result.perQuestion)
    ? result.perQuestion
    : [];

  const sections = parseSections(report.sections);
  const sectionByKey = new Map<string, ParsedSection>();
  for (const s of sections) sectionByKey.set(s.stableKey, s);

  const useDomainColors = !!perDomain;
  const hasScaleUpScore = typeof result.scaleUpScore === "number";
  const neutral = isNeutralTier(report.scoringConfig) && !hasScaleUpScore;
  const headline = headlineForTierMetric(result, report.scoringConfig);

  // ── Pre-escaped strings ──────────────────────────────────────────────────
  const escName = escapeHtml(report.respondentName);
  const escTitle = escapeHtml(report.assessmentName);
  const escDate = escapeHtml(formatSubmittedAt(report.submittedAt));
  const escFirst = escapeHtml(firstName(report.respondentName));
  const escHeadlinePrimary = escapeHtml(headline.primary);
  const escHeadlineLabel = escapeHtml(headline.label);
  const escTierMessage =
    !neutral && result.tier?.message ? escapeHtml(result.tier.message) : "";

  // ── Subject — plain-text MIME header, NOT HTML ───────────────────────────
  // Use stripControlChars (prevents header injection) but NOT escapeHtml.
  // Subjects render as raw text in every email client; HTML entities would
  // appear literally (e.g. "O&#x27;Brien completed…").
  const safeName = stripControlChars(report.respondentName);
  const subject =
    recipientRole === "REFERRING_COACH"
      ? `${safeName} completed the Scaling Up 4 Decisions Assessment`
      : "Your Scaling Up 4 Decisions results";

  // ── Cover ──────────────────────────────────────────────────────────────
  const cover = `
  <tr>
    <td style="height:6px;padding:0;font-size:0;line-height:0;background:${D_PEOPLE};">&nbsp;</td>
  </tr>
  <tr>
    <td style="padding:0;font-size:0;line-height:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="25%" style="height:4px;background:${D_PEOPLE};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" style="height:4px;background:${D_STRATEGY};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" style="height:4px;background:${D_EXECUTION};font-size:0;line-height:0;">&nbsp;</td>
          <td width="25%" style="height:4px;background:${D_CASH};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:${PURPLE};background-image:linear-gradient(135deg,${PURPLE},${PURPLE_DEEP});padding:28px 32px 26px;color:#ffffff;">
      <div style="font-weight:800;letter-spacing:0.04em;font-size:14px;color:#ffffff;margin-bottom:14px;">SCALING UP</div>
      <div style="font-size:21px;font-weight:800;color:#ffffff;line-height:1.2;margin-bottom:4px;">${escTitle}</div>
      <div style="font-size:13px;color:#ffffff;opacity:0.85;">Report for ${escName} &middot; ${escDate}</div>
    </td>
  </tr>`;

  // ── Overall ──────────────────────────────────────────────────────────────
  const bandPill = neutral
    ? `<span style="display:inline-block;background:${PURPLE_TINT};color:${PURPLE};font-weight:800;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">Submitted</span>`
    : escHeadlineLabel
      ? `<span style="display:inline-block;background:${PURPLE_TINT};color:${PURPLE};font-weight:800;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;padding:5px 12px;border-radius:999px;">${escHeadlineLabel}</span>`
      : "";

  const metaCells: string[] = [
    `<td style="padding:0 14px 0 0;vertical-align:top;">
       <div style="font-size:18px;font-weight:800;color:${PURPLE};line-height:1;">${escapeHtml(formatNumber(result.overallTotal ?? 0))}</div>
       <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};margin-top:2px;">Total points</div>
     </td>`,
    `<td style="padding:0 14px;vertical-align:top;">
       <div style="font-size:18px;font-weight:800;color:${PURPLE};line-height:1;">${escapeHtml(formatNumber(result.overallAverage ?? 0))}</div>
       <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};margin-top:2px;">Avg / item</div>
     </td>`,
    `<td style="padding:0 0 0 14px;vertical-align:top;">
       <div style="font-size:18px;font-weight:800;color:${PURPLE};line-height:1;">${perSection.length}</div>
       <div style="font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};margin-top:2px;">Sections</div>
     </td>`,
  ];

  const overall = `
  <tr>
    <td style="padding:26px 32px;border-bottom:1px solid ${LINE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="120" valign="middle" style="padding:0 22px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="110" style="border:6px solid ${PURPLE_TINT};border-radius:55px;background:#ffffff;">
              <tr>
                <td align="center" valign="middle" style="height:98px;width:98px;">
                  ${(() => {
                    // Split "58 / 100" → big number + small denominator.
                    // Neutral templates show "Submitted" (no slash) → single label.
                    const slashIdx = headline.primary.indexOf("/");
                    if (!neutral && slashIdx !== -1) {
                      const num = escapeHtml(headline.primary.slice(0, slashIdx).trim());
                      const den = escapeHtml(headline.primary.slice(slashIdx).trim());
                      return `<div style="font-size:30px;font-weight:800;color:${PURPLE};line-height:1;">${num}</div>
                  <div style="font-size:12px;color:#6b6480;line-height:1.4;">${den}</div>`;
                    }
                    return `<div style="font-size:22px;font-weight:800;color:${PURPLE};line-height:1;padding:0 4px;">${escHeadlinePrimary}</div>`;
                  })()}
                </td>
              </tr>
            </table>
          </td>
          <td valign="middle">
            ${bandPill}
            ${escTierMessage ? `<div style="font-size:14px;color:${INK};margin-top:8px;line-height:1.5;">${escTierMessage}</div>` : ""}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>${metaCells.join("")}</tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  // ── Per-decision cards (domains) ───────────────────────────────────────────
  // Each domain row → a colored-left-border card with the domain average + a
  // simple bar. Falls back to nothing when there are no domains.
  let cardsBlock = "";
  if (perDomain && perDomain.length > 0) {
    const cardRows = perDomain
      .map((d) => {
        const color = useDomainColors ? domainColor(d.key) : PURPLE;
        // Use a WCAG-AA contrast-safe text color for the avg numeral (bright
        // domain colors like People #f7a600 / Cash #95c11f fail 3.0:1 on white).
        // The left border and progress bar keep the full-brightness domain color.
        const textColor = useDomainColors
          ? (DOMAIN_TEXT_COLOR[d.key.toLowerCase()] ?? color)
          : PURPLE;
        const avg = typeof d.averagePoints === "number" ? d.averagePoints : 0;
        // bar width as a percentage of a 0-10 scale, clamped.
        const pct = Math.max(0, Math.min(100, avg * 10));
        const escLabel = escapeHtml(d.label || d.key);
        const escAvg = escapeHtml(formatNumber(avg));
        return `
        <tr>
          <td style="padding:6px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-left:5px solid ${color};border-radius:13px;">
              <tr>
                <td style="padding:14px 15px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-weight:800;font-size:15px;color:${INK};">${escLabel}</td>
                      <td align="right" style="font-size:22px;font-weight:800;color:${textColor};">${escAvg}</td>
                    </tr>
                  </table>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;background:#eeeeee;border-radius:4px;">
                    <tr>
                      <td width="${pct}%" style="height:7px;background:${color};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
                      <td style="font-size:0;line-height:0;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
      })
      .join("");
    cardsBlock = `
    <tr>
      <td style="padding:24px 32px 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};font-weight:800;">How you scored, by decision</td>
    </tr>
    <tr>
      <td style="padding:0 32px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cardRows}</table>
      </td>
    </tr>`;
  }

  // ── Score-summary table ────────────────────────────────────────────────────
  const tableRows = perSection
    .map((ps) => {
      const parsed = sectionByKey.get(ps.stableKey);
      const dotColor =
        useDomainColors && parsed?.domain ? domainColor(parsed.domain) : null;
      const dot = dotColor
        ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dotColor};margin-right:8px;">&nbsp;</span>`
        : "";
      const escSecName = escapeHtml(parsed?.name ?? ps.name ?? ps.stableKey);
      return `
      <tr>
        <td style="text-align:left;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:13px;color:${INK};">${dot}${escSecName}</td>
        <td style="text-align:right;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:13px;color:${PURPLE};font-weight:700;">${escapeHtml(formatNumber(ps.totalPoints))}</td>
        <td style="text-align:right;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};">${escapeHtml(formatNumber(ps.averagePoints))}</td>
      </tr>`;
    })
    .join("");

  // #24 — the "Score summary" table is shown only when report-config allows it
  // (hidden for the Rockefeller alias, shown for default/scored templates).
  const scoresTable = reportConfigFor(report.templateAlias).showScoreTable
    ? `
  <tr>
    <td style="padding:24px 32px 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};font-weight:800;">Score summary</td>
  </tr>
  <tr>
    <td style="padding:8px 32px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <th style="text-align:left;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Decision</th>
          <th style="text-align:right;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Score</th>
          <th style="text-align:right;padding:9px 10px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Average</th>
        </tr>
        ${tableRows}
        <tr>
          <td style="text-align:left;padding:9px 10px;border-top:2px solid ${INK};font-weight:800;color:${PURPLE};font-size:13px;">Total</td>
          <td style="text-align:right;padding:9px 10px;border-top:2px solid ${INK};font-weight:800;color:${PURPLE};font-size:13px;">${escapeHtml(formatNumber(result.overallTotal ?? 0))}</td>
          <td style="text-align:right;padding:9px 10px;border-top:2px solid ${INK};font-weight:800;color:${PURPLE};font-size:13px;">${escapeHtml(formatNumber(result.overallAverage ?? 0))}</td>
        </tr>
      </table>
    </td>
  </tr>`
    : "";

  // ── Detailed breakdown — per-section statement rows with score chips ───────
  // Mirrors the on-screen "Detailed breakdown" section. Groups per-question
  // rows under their section. Degrades gracefully when no per-question data.
  let breakdownBlock = "";
  if (perQuestion.length > 0 && perSection.length > 0) {
    // Build sectionStableKey → perQuestion rows map using questionsByKey meta.
    const pqByKey = new Map<string, PerQuestionResult>();
    for (const pq of perQuestion) pqByKey.set(pq.stableKey, pq);

    const sectionGroups = perSection
      .map((ps) => {
        const parsed = sectionByKey.get(ps.stableKey);
        // Questions for this section from the parsed sections questionKeys.
        const qKeys: string[] = parsed?.questionKeys ?? [];
        // Fallback: find questions whose questionsByKey.sectionStableKey matches.
        const rows: PerQuestionResult[] =
          qKeys.length > 0
            ? qKeys.map((k) => pqByKey.get(k)).filter((r): r is PerQuestionResult => !!r)
            : perQuestion.filter((pq) => {
                const meta = report.questionsByKey?.[pq.stableKey];
                return meta?.sectionStableKey === ps.stableKey;
              });
        const dotColor =
          useDomainColors && parsed?.domain ? domainColor(parsed.domain) : PURPLE;
        const escSecName = escapeHtml(parsed?.name ?? ps.name ?? ps.stableKey);
        return { ps, parsed, rows, dotColor, escSecName };
      })
      .filter((g) => g.rows.length > 0);

    if (sectionGroups.length > 0) {
      const groupHtml = sectionGroups
        .map(({ rows, dotColor, escSecName }) => {
          const rowHtml = rows
            .map((r) => {
              const lbl = report.questionByKey?.[r.stableKey] ?? r.stableKey;
              const escLbl = escapeHtml(typeof lbl === "string" ? lbl : String(lbl));
              const max = report.questionsByKey?.[r.stableKey]?.max;
              const scoreText = max !== undefined
                ? `${r.value} / ${max}`
                : String(r.value);
              return `
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:13px;color:#3a3450;line-height:1.45;">${escLbl}</td>
                <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};white-space:nowrap;vertical-align:top;">
                  <span style="display:inline-block;min-width:30px;text-align:center;font-weight:800;font-size:13px;color:${PURPLE};background:${PURPLE_TINT};border-radius:7px;padding:3px 8px;font-variant-numeric:tabular-nums;">${escapeHtml(scoreText)}</span>
                </td>
              </tr>`;
            })
            .join("");
          const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dotColor};margin-right:8px;vertical-align:middle;">&nbsp;</span>`;
          return `
          <tr>
            <td colspan="2" style="padding:14px 0 4px;font-weight:800;font-size:13px;color:${INK};">${dot}${escSecName}</td>
          </tr>
          ${rowHtml}`;
        })
        .join("");

      breakdownBlock = `
      <tr>
        <td style="padding:24px 32px 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};font-weight:800;">Detailed breakdown</td>
      </tr>
      <tr>
        <td style="padding:4px 32px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${groupHtml}
          </table>
        </td>
      </tr>`;
    }
  }

  // ── Conclusion + footer ────────────────────────────────────────────────────
  const leadIn =
    recipientRole === "REFERRING_COACH"
      ? `<tr><td style="padding:18px 32px 0;font-size:14px;color:${INK};line-height:1.5;">Your client <strong>${escName}</strong> just completed the Scaling Up 4 Decisions Assessment. Their full results are below.</td></tr>`
      : "";

  const conclusionTitle =
    recipientRole === "REFERRING_COACH"
      ? `Follow up with ${escFirst}.`
      : `Keep scaling, ${escFirst}.`;
  const conclusionBody =
    recipientRole === "REFERRING_COACH"
      ? `Reach out to turn these results into a 90-day plan together.`
      : `You&rsquo;ve completed your assessment. Turn these results into a 90-day plan with your Scaling Up Certified Coach.`;

  // CTA href: if the report has a referring coach email, link to mailto; else
  // fall back to the SU coaches directory.
  const ctaHref = report.referringCoachEmail
    ? `mailto:${encodeURIComponent(report.referringCoachEmail)}`
    : "https://scalingup.com/coaches";
  const ctaLabel = "Talk to your Scaling Up Certified Coach →";

  const conclusion = `
  <tr>
    <td style="padding:22px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SOFT};border:1px solid ${LINE};border-radius:13px;">
        <tr>
          <td align="center" style="padding:20px;">
            <div style="font-size:16px;font-weight:800;color:${INK};margin-bottom:6px;">${conclusionTitle}</div>
            <div style="font-size:13px;color:${MUTED};line-height:1.5;margin-bottom:14px;">${conclusionBody}</div>
            <a href="${ctaHref}" style="display:inline-block;background:${PURPLE};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:11px;font-size:14px;">${ctaLabel}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:18px 32px 26px;font-size:11px;color:${MUTED};">${escDate} &middot; Generated by Scaling Up Platform</td>
  </tr>`;

  // ── Assemble — single centered column, table layout, inline styles only ────
  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escTitle}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#eef0f4;font-family:${FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f4;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          ${cover}
          ${leadIn}
          ${overall}
          ${cardsBlock}
          ${scoresTable}
          ${breakdownBlock}
          ${conclusion}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, bodyHtml };
}

export default buildReportEmailHtml;
