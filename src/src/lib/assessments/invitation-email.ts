/**
 * Assessment invitation email — token interpolation + branded HTML/text rendering.
 * Pure module (no I/O). Mirrors the inline-style, escape-safe conventions of report-email.ts.
 *
 * SECURITY:
 *  - HTML body values are escaped by the markdown-lite renderer (single escaping authority).
 *  - The subject uses a restricted token allowlist that EXCLUDES url/email/token-bearing
 *    values, so the raw `#t=<token>` invitation credential can never land in a subject/header.
 *  - Inline links accept only http/https/relative URLs (javascript:/data:/protocol-relative rejected).
 */
import { escapeHtml } from "@/lib/templates/interpolate-content-html";
import { SU_LOGO_CID } from "@/lib/assets/invitation-logo";

export interface InvitationVars {
  respondent: { firstName: string; lastName: string; email: string };
  organizationName: string | null;
  campaignName: string;
  templateName: string | null;
  coachName: string | null;
  invitationUrl: string;
  closeAt: Date | null;
}

function formatCloseAt(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * Strip markdown structural characters so a substituted DATA token VALUE can never
 * form a real link/bold/code span in the HTML body. Markdown is honored ONLY from the
 * coach-authored template, never from respondent/org-supplied values. Applied to data
 * fields only — NOT to the server-generated URL (it is used as an href in template links).
 */
function neutralizeMarkdown(s: string): string {
  return s.replace(/[*[\]`]/g, ""); // strip bold/link/code delimiters so data can't form markdown
}

/** Canonical token → resolved string value, with neutral fallbacks for empty known tokens. */
export function buildTokenValues(vars: InvitationVars): Record<string, string> {
  const first = neutralizeMarkdown((vars.respondent.firstName ?? "").trim() || "there");
  const last = neutralizeMarkdown((vars.respondent.lastName ?? "").trim());
  const full = neutralizeMarkdown(`${vars.respondent.firstName ?? ""} ${vars.respondent.lastName ?? ""}`.trim() || "there");
  const org = neutralizeMarkdown((vars.organizationName ?? "").trim() || "your organization");
  const campaign = neutralizeMarkdown((vars.campaignName ?? "").trim() || "your assessment");
  const template = neutralizeMarkdown((vars.templateName ?? "").trim() || "your assessment");
  const coach = neutralizeMarkdown((vars.coachName ?? "").trim() || "your coach");
  const email = neutralizeMarkdown((vars.respondent.email ?? "").trim());
  const closeAt = vars.closeAt ? formatCloseAt(vars.closeAt) : "ongoing";
  const url = vars.invitationUrl; // server-generated — left untouched (used as href in template links)
  // keys are normalized (lowercase, underscores stripped)
  return {
    respondentfirstname: first, firstname: first,
    respondentlastname: last, lastname: last,
    respondentfullname: full, respondentname: full, fullname: full,
    respondentemail: email, email,
    organizationname: org,
    campaignname: campaign,
    templatename: template,
    coachname: coach,
    invitationurl: url, assessmenturl: url,
    closeat: closeAt,
  };
}

const TOKEN_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
function normKey(raw: string): string {
  return raw.toLowerCase().replace(/_/g, "");
}

/**
 * Replace {{tokens}} (both camelCase and snake_case). Unknown tokens → stripped.
 * When `allow` is provided, tokens whose normalized key is not in the set are stripped
 * (used by the subject path to exclude url/email/token-bearing values).
 */
export function interpolateTokens(
  template: string,
  values: Record<string, string>,
  allow?: Set<string>,
): string {
  return template.replace(TOKEN_RE, (_m, raw: string) => {
    const key = normKey(raw);
    if (allow && !allow.has(key)) return "";
    return key in values ? values[key] : "";
  });
}

// ── Subject ─────────────────────────────────────────────────────────────────
// Allowlist EXCLUDES url/email/token-bearing keys so a credential can never
// reach a subject line / SMTP header / telemetry record.
const SUBJECT_ALLOW = new Set<string>([
  "respondentfirstname", "firstname",
  "respondentlastname", "lastname",
  "respondentfullname", "respondentname", "fullname",
  "organizationname", "campaignname", "templatename", "coachname", "closeat",
]);

function stripControlChars(value: string): string {
  // Removes CR/LF and other control chars (header-injection safe). Mirrors report-email.ts
  // (which strips C0 + C1 via the same hex-escape range — no eslint-disable needed for those).
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").trim();
}

export function renderSubject(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  let s = stripControlChars(interpolateTokens(template, values, SUBJECT_ALLOW));
  // Defense-in-depth: assert no invitation credential leaked into the subject.
  if (vars.invitationUrl && s.includes(vars.invitationUrl)) {
    s = s.split(vars.invitationUrl).join("");
  }
  if (s.includes("#t=")) {
    s = s.replace(/#t=\S+/g, "");
  }
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

// ── Link policy ───────────────────────────────────────────────────────────
/** Returns a safe href or null. Allows http(s) and root-relative; rejects javascript:/data:/protocol-relative/malformed. */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith("//")) return null;              // protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {             // has a scheme
    if (/^https?:/i.test(url)) return url;
    return null;                                       // javascript:, data:, mailto:, etc. rejected
  }
  if (url.startsWith("/")) return url;                 // root-relative
  return null;                                         // anything else (encoded, malformed)
}

// ── Markdown-lite (links + bold), escape-first ──────────────────────────────
function renderInline(escaped: string): string {
  // `escaped` already HTML-escaped. Markdown delimiters (* [ ] ( )) are unaffected by escaping.
  // Links: [text](url)
  let out = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const href = safeHref(url);
    return href
      ? `<a href="${escapeHtml(href)}" style="color:#522583;text-decoration:underline;">${text}</a>`
      : text;
  });
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

/** Remove a standalone line whose only content is a markdown link to the invitation URL (shell has its own CTA). */
function dropRedundantCta(body: string, invitationUrl: string): string {
  const lines = body.split("\n");
  const kept = lines.filter((line) => {
    const m = line.trim().match(/^\[[^\]]+\]\(([^)\s]+)\)$/);
    return !(m && m[1] === invitationUrl);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function renderHtmlBody(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  const interpolated = dropRedundantCta(interpolateTokens(template, values), vars.invitationUrl);
  const paragraphs = interpolated
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((p) => {
      const withBreaks = escapeHtml(p).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6;">${renderInline(withBreaks)}</p>`;
    })
    .join("");
  return paragraphs;
}

export function renderTextBody(template: string, vars: InvitationVars): string {
  const values = buildTokenValues(vars);
  let txt = dropRedundantCta(interpolateTokens(template, values), vars.invitationUrl);
  txt = txt.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)"); // link → "text (url)"
  txt = txt.replace(/\*\*([^*]+)\*\*/g, "$1");                 // bold → text
  return `${txt.trim()}\n\nStart the assessment: ${vars.invitationUrl}`;
}

// ── Branded shell ───────────────────────────────────────────────────────────
const PURPLE = "#522583";
const PURPLE_DEEP = "#3d1a63";
const D_PEOPLE = "#E4002B", D_STRATEGY = "#00A6CE", D_EXECUTION = "#FFB81C", D_CASH = "#43B02A";

export function buildInvitationEmailHtml(input: { bodyMarkdown: string; vars: InvitationVars }): string {
  const { bodyMarkdown, vars } = input;
  const bodyHtml = renderHtmlBody(bodyMarkdown, vars);
  const orgLine = vars.organizationName ? escapeHtml(vars.organizationName) : "";
  return `
<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="25%" style="height:6px;background:${D_PEOPLE};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_STRATEGY};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_EXECUTION};font-size:0;line-height:0;">&nbsp;</td>
      <td width="25%" style="height:6px;background:${D_CASH};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>
  <div style="background:${PURPLE};background-image:linear-gradient(135deg,${PURPLE},${PURPLE_DEEP});padding:28px 32px;">
    <img src="cid:${SU_LOGO_CID}" alt="Scaling Up" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />
    ${orgLine ? `<div style="margin-top:14px;font-size:13px;color:#ffffff;opacity:0.85;">${orgLine}</div>` : ""}
  </div>
  <div style="padding:28px 32px 8px;">
    ${bodyHtml}
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${escapeHtml(vars.invitationUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Start the assessment</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px;">If the button doesn't work, paste this into your browser:<br/><span style="word-break:break-all;color:#6b7280;">${escapeHtml(vars.invitationUrl)}</span></p>
  </div>
  <div style="padding:18px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">&mdash; Scaling Up Platform</div>
</div>`.trim();
}

// ── Coach-name resolver (creator coach ?? org owner) ────────────────────────
type CoachName = { firstName: string; lastName: string } | null;
export function resolveCoachName(creatorCoach: CoachName, ownerCoach: CoachName): string | null {
  const pick = creatorCoach ?? ownerCoach;
  if (!pick) return null;
  const name = `${pick.firstName ?? ""} ${pick.lastName ?? ""}`.trim();
  return name.length > 0 ? name : null;
}
