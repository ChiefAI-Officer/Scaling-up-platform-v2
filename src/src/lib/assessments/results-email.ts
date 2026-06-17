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
export function renderResultsEmailBodyHtml(markdown: string): string {
  return markdown
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${renderInline(
        withBreaks,
      )}</p>`;
    })
    .join("");
}

export interface BuildResultsEmailArgs {
  /** Admin-authored body (markdown-lite). May be empty. */
  bodyMarkdown: string;
  /** Pre-rendered Spec-16 report HTML (from buildReportEmailHtml). */
  reportHtml: string;
}

/**
 * #15 body: the admin-authored intro followed by the Spec-16 branded report.
 * Both are already-safe strings (body is escape-first; reportHtml is built by
 * the email-safe report builder).
 */
export function buildResultsEmailHtml({
  bodyMarkdown,
  reportHtml,
}: BuildResultsEmailArgs): string {
  const intro = renderResultsEmailBodyHtml(bodyMarkdown);
  const introBlock = intro
    ? `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto 16px;padding:0 8px;">${intro}</div>`
    : "";
  return `${introBlock}${reportHtml}`;
}

export interface BuildCoachNotifyArgs {
  /** Public app origin (process.env.APP_URL). Trailing slash tolerated. */
  appUrl: string;
  campaignId: string;
  respondentId: string;
  /** Instrument title (template.name). Escaped before render. */
  assessmentName: string;
}

/**
 * #16 OWNING_COACH notify — a short, PII-minimal email whose ONLY pointer to
 * the respondent's data is an absolute link to the auth-gated Spec-13 report.
 * The link follows the (report) route group: /assessments/{id}/respondents/{rid}/report.
 */
export function buildCoachNotifyEmail({
  appUrl,
  campaignId,
  respondentId,
  assessmentName,
}: BuildCoachNotifyArgs): { subject: string; bodyHtml: string } {
  const origin = appUrl.replace(/\/+$/, "");
  const reportUrl = `${origin}/assessments/${encodeURIComponent(
    campaignId,
  )}/respondents/${encodeURIComponent(respondentId)}/report`;
  const name = escapeHtml(assessmentName);

  const subject = `A respondent completed ${assessmentName}`;
  const bodyHtml = `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#374151;">
  <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">A respondent has completed the <strong>${name}</strong> assessment.</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">View their full results report:</p>
  <p style="text-align:center;margin:0 0 20px;">
    <a href="${escapeHtml(reportUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">View the report</a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:12px;">You'll be asked to sign in to view the report.</p>
</div>`.trim();

  return { subject, bodyHtml };
}
