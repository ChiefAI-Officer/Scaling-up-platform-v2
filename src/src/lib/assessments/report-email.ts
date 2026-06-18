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
import {
  buildQualitativeModel,
  type QualItem,
  type QualSection,
} from "@/lib/assessments/qualitative-report-model";
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";

export type ReportEmailRecipientRole = "TAKER_COPY" | "REFERRING_COACH";

export interface BuildReportEmailArgs {
  report: RespondentReport;
  recipientRole: ReportEmailRecipientRole;
}

export interface ReportEmail {
  subject: string;
  bodyHtml: string;
  /**
   * Wave E (R2-M6) — set ONLY when the qualitative body failed to render and a
   * safe minimal fallback was returned instead. The caller can record this as a
   * render failure. Absent on the happy path (scored + qualitative) and on the
   * scored path entirely.
   */
  renderError?: string;
}

// ── Wave E (R1-M5) — qualitative email size budget ─────────────────────────
//
// Email clients choke on multi-hundred-KB bodies (Gmail clips at ~102 KB). The
// on-screen QualitativeReport is NOT truncated; this budget applies ONLY to the
// email twin. There is NO respondent report URL to link to (ADR-0007/0008), so
// truncation must stand alone.

/** Max characters of a single free-text answer rendered into the email. The RAW
 *  string is truncated to this BEFORE escaping (so the cap counts source chars,
 *  not entity-expanded chars). */
export const QUAL_EMAIL_ANSWER_CAP = 600;

/** Soft ceiling for the assembled qualitative BODY (the per-section HTML, not
 *  the surrounding shell). Once exceeded we stop appending further sections and
 *  add a short truncation note. */
export const QUAL_EMAIL_BYTE_BUDGET = 90_000;

const TRUNCATED_ANSWER_SUFFIX = "… (truncated)";
const QUAL_TRUNCATION_NOTE =
  "(report truncated for email; full report available to your coach)";

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

/**
 * Builds a RespondentReport from the data the public-quiz submit route already
 * has in hand — no DB round-trip. Pure. The result is shared by both report
 * emails (TAKER_COPY + REFERRING_COACH) so they are byte-identical.
 *
 * questionsByKey is built via the SHARED `buildQuestionMetaByKey` so the email
 * twin carries the SAME type+label+section+scale+options metadata as the
 * on-screen loader (C-M1) — including MULTI_CHOICE {key,label} options so keys
 * resolve to labels (C-H1).
 */
export function buildRespondentReportFromSubmission(
  args: BuildRespondentReportArgs,
): RespondentReport {
  const questionsByKey = buildQuestionMetaByKey(args.questions);
  const questionByKey: Record<string, string> = {};
  for (const [key, meta] of Object.entries(questionsByKey)) {
    questionByKey[key] = meta.label;
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

// ── Qualitative email body (Wave E, Task 11) ───────────────────────────────
//
// The EMAIL twin of the on-screen QualitativeReport. Inline-HTML string
// assembly does NOT auto-escape, so EVERY respondent-controlled value (answer
// text, option labels, question labels) is escaped here (R2-H3). Free-text is
// size-capped (R1-M5) and each item/section render is wrapped in try/catch so a
// malformed shape degrades instead of throwing the whole email (R2-M6).

/** Truncate a RAW answer string to the cap (BEFORE escaping) with a suffix. */
function capRawAnswer(raw: string): string {
  if (raw.length <= QUAL_EMAIL_ANSWER_CAP) return raw;
  return raw.slice(0, QUAL_EMAIL_ANSWER_CAP) + TRUNCATED_ANSWER_SUFFIX;
}

/** Render an answer value to a display string. Arrays join with commas; numbers
 *  stringify; objects/other shapes become "" (caught defensively upstream). */
function qualAnswerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "string" || typeof v === "number" ? String(v) : "",
      )
      .filter((s) => s !== "")
      .join(", ");
  }
  // An object / null / undefined is not a presentable scalar — render nothing.
  return "";
}

/** Display text for an item. Prefers the model's resolved `displayValues`
 *  (MULTI_CHOICE option labels) so stored keys never reach the email (C-H1);
 *  falls back to the raw value otherwise. The model does the key→label
 *  resolution; this renderer stays dumb (joins + escapes only). */
function qualItemText(item: QualItem): string {
  if (item.displayValues) return item.displayValues.join(", ");
  return qualAnswerText(item.value);
}

/** Clamp a numeric percent into an integer in [0,100] for a style width. NEVER
 *  interpolate a raw answer into a style/attribute. */
function clampPercent(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Is this item a percentage NUMBER (0–100 scale)? → rendered as a fill bar. */
function isPercentQualItem(item: QualItem): boolean {
  return (
    item.type === "NUMBER" &&
    typeof item.value === "number" &&
    item.min === 0 &&
    item.max === 100
  );
}

/** Render ONE qualitative item to an email-safe HTML row. Throws on a truly
 *  pathological shape; the section assembler catches per-item. */
function renderQualItem(item: QualItem): string {
  const escLabel = escapeHtml(item.label);

  // Percent NUMBER → label + fill bar (width clamped, never raw-interpolated).
  if (isPercentQualItem(item)) {
    const pct = clampPercent(item.value);
    const escVal = escapeHtml(qualAnswerText(item.value));
    return `
    <tr>
      <td style="padding:8px 0 2px;font-weight:700;font-size:13px;color:${INK};line-height:1.45;">${escLabel}</td>
    </tr>
    <tr>
      <td style="padding:0 0 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-right:10px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eeeeee;border-radius:4px;">
                <tr>
                  <td width="${pct}%" style="height:8px;background:${PURPLE};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
            <td align="right" style="white-space:nowrap;font-weight:800;font-size:13px;color:${PURPLE};">${escVal}%</td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  // SLIDER_LIKERT / NUMBER (non-percent) → label + value chip (statement row).
  if (item.type === "SLIDER_LIKERT" || item.type === "NUMBER") {
    const escVal = escapeHtml(qualAnswerText(item.value));
    return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-size:13px;color:#3a3450;line-height:1.45;">${escLabel}</td>
      <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};white-space:nowrap;vertical-align:top;">
        <span style="display:inline-block;min-width:30px;text-align:center;font-weight:800;font-size:13px;color:${PURPLE};background:${PURPLE_TINT};border-radius:7px;padding:3px 8px;">${escVal}</span>
      </td>
    </tr>`;
  }

  // TEXT / MULTI_CHOICE / everything else → blue question heading + answer text.
  // MULTI_CHOICE renders resolved option LABELS (via item.displayValues, set by
  // the model — C-H1), each escaped by escapeHtml. Free-text is RAW-capped
  // before escaping.
  const rawText = qualItemText(item);
  const escAnswer = escapeHtml(capRawAnswer(rawText));
  return `
  <tr>
    <td colspan="2" style="padding:12px 0 2px;font-weight:800;font-size:14px;color:${PURPLE};line-height:1.4;">${escLabel}</td>
  </tr>
  <tr>
    <td colspan="2" style="padding:0 0 12px;font-size:13px;color:${INK};line-height:1.55;">${escAnswer}</td>
  </tr>`;
}

/** Render ONE qualitative section (heading + description + item rows). Per-item
 *  try/catch so a malformed answer skips that item only. Returns "" if every
 *  item failed AND there is no heading worth showing. */
function renderQualSection(section: QualSection): string {
  const escName = escapeHtml(section.name);
  const escDesc =
    typeof section.description === "string" && section.description.trim() !== ""
      ? escapeHtml(section.description)
      : "";

  const itemRows: string[] = [];
  for (const item of section.items) {
    try {
      itemRows.push(renderQualItem(item));
    } catch {
      // R2-M6: skip a malformed item; the rest of the section still renders.
      continue;
    }
  }
  if (itemRows.length === 0) return "";

  const descHtml = escDesc
    ? `<tr><td colspan="2" style="padding:2px 0 6px;font-size:13px;color:${MUTED};line-height:1.5;">${escDesc}</td></tr>`
    : "";

  return `
  <tr>
    <td style="padding:22px 32px 0;">
      <div style="font-size:16px;font-weight:800;color:${INK};margin-bottom:4px;">${escName}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${descHtml}
        ${itemRows.join("")}
      </table>
    </td>
  </tr>`;
}

/**
 * Assembles the qualitative BODY sections (the part that replaces the scored
 * anatomy). Returns the section HTML + whether truncation occurred. Pure; the
 * surrounding shell (cover/preface/footer) is added by the caller.
 *
 * Size budget (R1-M5): sections are appended until the running byte total would
 * exceed QUAL_EMAIL_BYTE_BUDGET; once exceeded we stop and append a standalone
 * truncation note (no report URL exists to link to).
 */
function buildQualitativeBodySections(report: RespondentReport): {
  html: string;
  truncated: boolean;
} {
  const model = buildQualitativeModel({
    templateAlias: report.templateAlias,
    sections: report.sections,
    questionsByKey: report.questionsByKey,
    rawAnswers: report.rawAnswers,
  });

  const parts: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (const section of model.sections) {
    let sectionHtml = "";
    try {
      sectionHtml = renderQualSection(section);
    } catch {
      // R2-M6: a section that throws as a whole is skipped, not fatal.
      continue;
    }
    if (sectionHtml === "") continue;

    const addBytes = Buffer.byteLength(sectionHtml, "utf8");
    if (bytes + addBytes > QUAL_EMAIL_BYTE_BUDGET && parts.length > 0) {
      truncated = true;
      break;
    }
    parts.push(sectionHtml);
    bytes += addBytes;
  }

  return { html: parts.join(""), truncated };
}

/**
 * Assembles the full qualitative report email (shell + body). Reuses the scored
 * email's branded cover/footer; only the BODY differs. Never throws — on a body
 * render failure it returns a minimal safe body + a renderError signal (R2-M6).
 */
function buildQualitativeReportEmail({
  report,
  recipientRole,
  subject,
  cover,
  escName,
  escFirst,
  escDate,
}: {
  report: RespondentReport;
  recipientRole: ReportEmailRecipientRole;
  subject: string;
  cover: string;
  escName: string;
  escFirst: string;
  escDate: string;
}): ReportEmail {
  // M2: guard a non-string assessmentName so escaping the title can never throw
  // out of buildReportEmailHtml (the "never throws" contract). escTitle is used
  // by the shell, which is built on BOTH the success and catch paths below.
  const escTitle = escapeHtml(
    typeof report.assessmentName === "string"
      ? report.assessmentName
      : "Assessment",
  );

  const shell = (inner: string): string => `<!DOCTYPE html>
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
          ${inner}
          <tr>
            <td align="center" style="padding:18px 32px 26px;font-size:11px;color:${MUTED};">${escDate} &middot; Generated by Scaling Up Platform</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Preface / lead-in (text-only). Coach copy carries a "your client" lead-in.
  const preface =
    recipientRole === "REFERRING_COACH"
      ? `<tr><td style="padding:18px 32px 0;font-size:14px;color:${INK};line-height:1.5;">Your client <strong>${escName}</strong> just completed the assessment. Their answers, organized by theme, are below.</td></tr>`
      : `<tr><td style="padding:18px 32px 0;font-size:14px;color:${INK};line-height:1.5;">Dear ${escFirst}, here is your report — your own answers, organized by theme.</td></tr>`;

  try {
    const { html: sectionsHtml, truncated } = buildQualitativeBodySections(report);

    const truncationNote = truncated
      ? `<tr><td style="padding:14px 32px 0;font-size:12px;color:${MUTED};font-style:italic;line-height:1.5;">${escapeHtml(
          QUAL_TRUNCATION_NOTE,
        )}</td></tr>`
      : "";

    // No present sections at all → a graceful "received" body (not an error).
    const body =
      sectionsHtml === ""
        ? `<tr><td style="padding:22px 32px;font-size:14px;color:${INK};line-height:1.55;">Your assessment has been received.</td></tr>`
        : `${preface}${sectionsHtml}${truncationNote}`;

    return { subject, bodyHtml: shell(body) };
  } catch (err) {
    // R2-M6: the WHOLE body failed — minimal safe fallback + render signal.
    const fallback = `<tr><td style="padding:22px 32px;font-size:14px;color:${INK};line-height:1.55;">Your assessment has been received.</td></tr>`;
    return {
      subject,
      bodyHtml: shell(fallback),
      renderError: err instanceof Error ? err.message : "qualitative render failed",
    };
  }
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

  // ── Qualitative dispatch (Wave E, Task 11) ───────────────────────────────
  // For qualitative templates (LVA / QSP) the BODY renders the respondent's own
  // answers (escaped, size-capped, defensively) instead of the scored anatomy.
  // The cover/footer shell is shared. A render failure NEVER throws out of here:
  // it degrades to a minimal safe body + a renderError signal for the caller.
  if (reportConfigFor(report.templateAlias).reportType === "qualitative") {
    return buildQualitativeReportEmail({
      report,
      recipientRole,
      subject,
      cover,
      escName,
      escFirst,
      escDate,
    });
  }

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
