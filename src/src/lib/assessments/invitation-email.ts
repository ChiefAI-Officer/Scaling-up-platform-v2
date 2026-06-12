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

/** Canonical token → resolved string value, with neutral fallbacks for empty known tokens. */
export function buildTokenValues(vars: InvitationVars): Record<string, string> {
  const first = (vars.respondent.firstName ?? "").trim() || "there";
  const last = (vars.respondent.lastName ?? "").trim();
  const full = `${vars.respondent.firstName ?? ""} ${vars.respondent.lastName ?? ""}`.trim() || "there";
  const org = (vars.organizationName ?? "").trim() || "your organization";
  const campaign = (vars.campaignName ?? "").trim() || "your assessment";
  const template = (vars.templateName ?? "").trim() || "your assessment";
  const coach = (vars.coachName ?? "").trim() || "your coach";
  const email = (vars.respondent.email ?? "").trim();
  const closeAt = vars.closeAt ? formatCloseAt(vars.closeAt) : "ongoing";
  const url = vars.invitationUrl;
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
