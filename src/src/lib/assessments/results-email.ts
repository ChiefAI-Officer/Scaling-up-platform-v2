/**
 * Wave D (#15 / #16) — results + coach-notify email builders.
 *
 * Two emails are enqueued in the INVITED submit transaction:
 *   #15 RESPONDENT results — the admin-authored body (markdown-lite) followed by
 *       the Spec-16 branded report HTML (rendered from the just-computed
 *       ScoreResult). Approval-gated upstream (isResultsEmailApproved).
 *   #16 OWNING_COACH notify — a SHORT notification carrying only an absolute
 *       link to the gated Spec-13 report. Deliberately PII-minimal: the coach
 *       must click through (auth-gated) to see the respondent's data.
 *
 * Both builders are PURE (props in → string out). Every interpolated value is
 * HTML-escaped. Markdown-lite mirrors invitation-email.ts (links + bold,
 * escape-first) so the body cannot smuggle raw HTML.
 */

import { escapeHtml } from "@/lib/templates/interpolate-content-html";

const PURPLE = "#522583";
const RESPONDENT_FIRST_NAME_TOKEN = "{{respondentFirstName}}";

function stripSubjectControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

export function renderResultsEmailSubject(
  subject: string,
  respondentFirstName: string,
): string {
  return subject
    .split(RESPONDENT_FIRST_NAME_TOKEN)
    .join(stripSubjectControlCharacters(respondentFirstName));
}

/** A CEO capability must never be delivered via an ambiguous or remote HTTP URL. */
function safeCeoSelfAccessHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return url.href;
    const localHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]" ||
      url.hostname.endsWith(".test");
    return url.protocol === "http:" && localHost ? url.href : null;
  } catch {
    return null;
  }
}

/** Accept only http(s) and root-relative URLs in markdown links. */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith("//")) return null; // protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return /^https?:/i.test(url) ? url : null; // javascript:/data:/mailto: rejected
  }
  if (url.startsWith("/")) return url; // root-relative
  return null;
}

/** Markdown-lite inline render (links + bold) on already-escaped text. */
function renderInline(escaped: string): string {
  let out = escaped.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, url: string) => {
      const href = safeHref(url);
      return href
        ? `<a href="${href}" style="color:${PURPLE};text-decoration:underline;">${text}</a>`
        : text;
    },
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/**
 * Renders the admin-authored results-email markdown body to escape-first HTML
 * paragraphs. Empty/whitespace input → "".
 */
export function renderResultsEmailBodyHtml(
  markdown: string,
  respondentFirstName: string,
): string {
  const escapedFirstName = escapeHtml(respondentFirstName);
  return markdown
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br/>");
      const rendered = renderInline(withBreaks);
      const personalized = rendered
        .split(RESPONDENT_FIRST_NAME_TOKEN)
        .join(escapedFirstName);
      return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${personalized}</p>`;
    })
    .join("");
}

export interface BuildResultsEmailArgs {
  /** Admin-authored body (markdown-lite). May be empty. */
  bodyMarkdown: string;
  /** Pre-rendered Spec-16 report HTML (from buildReportEmailHtml). */
  reportHtml: string;
  /** Invited respondent first name, substituted into the admin-authored copy. */
  respondentFirstName: string;
  /** Purpose-bound CEO self-access URL, delivered only through approved #15 email. */
  ceoSelfAccessUrl?: string | null;
}

/**
 * #15 body: the admin-authored intro followed by the Spec-16 branded report.
 * Both are already-safe strings (body is escape-first; reportHtml is built by
 * the email-safe report builder).
 */
export function buildResultsEmailHtml({
  bodyMarkdown,
  reportHtml,
  respondentFirstName,
  ceoSelfAccessUrl,
}: BuildResultsEmailArgs): string {
  const intro = renderResultsEmailBodyHtml(bodyMarkdown, respondentFirstName);
  const introBlock = intro
    ? `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto 16px;padding:0 8px;">${intro}</div>`
    : "";
  const href = safeCeoSelfAccessHref(ceoSelfAccessUrl);
  const ceoSelfAccessCta = href
    ? `<p style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;text-align:center;margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">View and compare your reports</a></p>`
    : "";
  return `${introBlock}${reportHtml}${ceoSelfAccessCta}`;
}

export interface BuildCoachNotifyArgs {
  /** Public app origin (process.env.APP_URL). Trailing slash tolerated. */
  appUrl: string;
  campaignId: string;
  respondentId: string;
  /** Instrument title (template.name). Escaped before render. */
  assessmentName: string;
  /**
   * Respondent display name the caller already resolved via
   * respondentDisplayName (name, else the email fallback). Shown in the
   * subject + body so the coach knows WHO completed the assessment (Jeff #50).
   * Escaped before render. Blank → the generic "A respondent" wording.
   */
  respondentName: string;
}

/**
 * #16 OWNING_COACH notify — a short email carrying the respondent's name
 * (Jeff #50) and an absolute link to the auth-gated Spec-13 report. The name
 * lets the coach see WHO completed the assessment straight from their inbox;
 * the respondent's answers still live behind the auth-gated link. The link
 * follows the (report) route group: /assessments/{id}/respondents/{rid}/report.
 *
 * `respondentName` is resolved by the caller via respondentDisplayName (name,
 * else the email fallback per Wave P). Blank → the generic "A respondent"
 * wording, byte-identical to the pre-#50 email (no leading space, no empty
 * <strong>).
 */
export function buildCoachNotifyEmail({
  appUrl,
  campaignId,
  respondentId,
  assessmentName,
  respondentName,
}: BuildCoachNotifyArgs): { subject: string; bodyHtml: string } {
  const origin = appUrl.replace(/\/+$/, "");
  const reportUrl = `${origin}/assessments/${encodeURIComponent(
    campaignId,
  )}/respondents/${encodeURIComponent(respondentId)}/report`;
  const escAssessment = escapeHtml(assessmentName);

  // Subjects are plain text (not HTML), so the raw name/title is correct here.
  const who = respondentName.trim();
  const subject = who
    ? `${who} completed ${assessmentName}`
    : `A respondent completed ${assessmentName}`;

  const completedLine = who
    ? `<strong>${escapeHtml(who)}</strong> has completed the <strong>${escAssessment}</strong> assessment.`
    : `A respondent has completed the <strong>${escAssessment}</strong> assessment.`;

  const bodyHtml = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151;">
  <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${completedLine}</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">View their full results report:</p>
  <p style="text-align:center;margin:0 0 20px;">
    <a href="${escapeHtml(reportUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">View the report</a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:12px;">You'll be asked to sign in to view the report.</p>
</div>`.trim();

  return { subject, bodyHtml };
}
