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
import { safeImageSrc } from "@/lib/assessments/safe-image-src";
import { SU_LOGO_CID } from "@/lib/assets/invitation-logo";
import { sanitizeEmailHtml } from "@/lib/assessments/email-html-sanitizer";

export interface InvitationVars {
  respondent: { firstName: string; lastName: string; email: string };
  organizationName: string | null;
  campaignName: string;
  templateName: string | null;
  coachName: string | null;
  invitationUrl: string;
  closeAt: Date | null;
  /**
   * Wave P — coach logo for the branded-shell header (Jeff #2.1). Rendered
   * ONLY when the caller opts into chrome:"waveP" AND the URL passes
   * `safeImageSrc` (https-only). Ignored entirely by the legacy chrome and by
   * the full-HTML override path.
   */
  coachLogoUrl?: string | null;
  /**
   * Jeff #61 — when false, the invitation-email header omits the org/company
   * line so the email leads with the coach, not the company. Undefined/true
   * renders the line (byte-identical to prior output). Derived per-template
   * via `shouldShowOrgLine`.
   */
  showOrgLine?: boolean;
}

/**
 * Template aliases whose invitation-email header omits the org/company line.
 * Jeff #61: LVA leads with the coach, not the company. Other templates keep
 * the line (e.g. Rockefeller's is "fine as-is" per Jeff #69). Add an alias
 * here — one line — when a future template's item requests the same removal.
 */
export const ORG_LINE_SUPPRESSED_ALIASES: ReadonlySet<string> = new Set([
  "leadership-vision-alignment",
]);

/**
 * Whether the invitation-email header should render the org/company line for a
 * given template alias. Unknown/null alias → shown (fail-open to prior output).
 */
export function shouldShowOrgLine(templateAlias: string | null | undefined): boolean {
  if (!templateAlias) return true;
  return !ORG_LINE_SUPPRESSED_ALIASES.has(templateAlias);
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

/**
 * Returns a safe image src or null — STRICTER than `safeHref`: HTTPS only
 * (the email sanitizer already strips http: images — stay consistent).
 *
 * MOVED to `@/lib/assessments/safe-image-src` (GH #229) so the report chrome can
 * share it without dragging this email module into a client bundle. Re-exported
 * here so every existing importer and test keeps working.
 *
 * NOTE: imported at the top of this file, not `export … from` — this module calls
 * `safeImageSrc` itself, and a bare re-export would not bind the name locally.
 */
export { safeImageSrc };

// ── Markdown-lite (links + bold), escape-first ──────────────────────────────
function renderInline(escaped: string): string {
  // `escaped` already HTML-escaped. Markdown delimiters (* [ ] ( )) are unaffected by escaping.
  // Links: [text](url)
  let out = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const href = safeHref(url);
    return href
      ? `<a href="${href}" style="color:#522583;text-decoration:underline;">${text}</a>`
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

// ── Full-HTML override (#20) ────────────────────────────────────────────────
//
// When a campaign sets `invitationBodyHtml`, that HTML REPLACES the entire
// branded shell (no wrap). Render = interpolate → sanitize:
//   1. Interpolate the RAW stored bytes with Wave A's `interpolateTokens`
//      (SAME `TOKEN_RE` the placement validator counts with — PIN #1) so the
//      bytes that reach the sanitizer match the bytes the validator vetted.
//      No HTML-entity decode happens first (PIN #2): a stored
//      `&#123;&#123;invitationUrl&#125;&#125;` stays inert and is never
//      resurrected into a live token.
//   2. Token VALUES are HTML-escaped before substitution (a malicious
//      respondent name "<script>" becomes inert text), and the
//      post-interpolation strict sanitizer is the SECOND gate.
// The server-generated invitationUrl is escaped too (it lands in an href /
// text node — attribute/text encoding is correct; the URL has no `&`).

/** Token values for the full-HTML path: every value HTML-escaped (PIN: PII can't inject markup). */
function buildEscapedTokenValues(vars: InvitationVars): Record<string, string> {
  const raw = buildTokenValues(vars);
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    escaped[k] = escapeHtml(v);
  }
  return escaped;
}

/**
 * Render a per-campaign full-HTML invitation body. interpolate (Wave A
 * TOKEN_RE, escaped values, raw bytes) → strict sanitize. The RESULT is the
 * ENTIRE email body — NO branded shell wrap.
 */
export function renderFullHtmlBody(rawHtml: string, vars: InvitationVars): string {
  const values = buildEscapedTokenValues(vars);
  const interpolated = interpolateTokens(rawHtml, values); // PIN #1 + #2
  return sanitizeEmailHtml(interpolated);                  // second gate
}

/** Plain-text twin derived from the rendered full-HTML body (tags stripped). */
export function renderFullTextBody(rawHtml: string, vars: InvitationVars): string {
  const html = renderFullHtmlBody(rawHtml, vars);
  const text = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")        // <br> → newline
    .replace(/<\/(p|div|tr|h[1-4]|li)\s*>/gi, "\n") // block close → newline
    .replace(/<[^>]+>/g, "")                          // strip remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Guarantee the survey link is reachable in the plain-text twin even if the
  // coach only used it as an href (tags — and their hrefs — are stripped above).
  if (vars.invitationUrl && !text.includes(vars.invitationUrl)) {
    return `${text}\n\nStart the assessment: ${vars.invitationUrl}`.trim();
  }
  return text;
}

// ── Branded shell ───────────────────────────────────────────────────────────
const PURPLE = "#522583";
const PURPLE_DEEP = "#3d1a63";
const D_PEOPLE = "#E4002B", D_STRATEGY = "#00A6CE", D_EXECUTION = "#FFB81C", D_CASH = "#43B02A";

/** Chrome variant for the branded shell. "legacy" (the default) is byte-identical to pre-Wave-P output. */
export type InvitationChrome = "legacy" | "waveP";

export function buildInvitationEmailHtml(input: {
  bodyMarkdown: string;
  vars: InvitationVars;
  /**
   * Wave P chrome (Jeff #2.1 coach logo + #2.4 larger CTA). DEFAULT "legacy":
   * output stays BYTE-IDENTICAL to today regardless of coachLogoUrl. The
   * module never reads the flag — callers evaluate `isInviteEmailChromeEnabled`
   * once per send and pass the variant.
   */
  chrome?: InvitationChrome;
}): string {
  const { bodyMarkdown, vars } = input;
  const waveP = (input.chrome ?? "legacy") === "waveP";
  const bodyHtml = renderHtmlBody(bodyMarkdown, vars);
  const orgLine =
    vars.organizationName && vars.showOrgLine !== false ? escapeHtml(vars.organizationName) : "";
  // Coach logo (waveP only): https-gated src, escaped; alt = coach name,
  // control-char-stripped + escaped (no attribute breakout). Fixed max sizes
  // so an oversized image cannot blow up the 560px layout. No logo URL or a
  // failed gate → header byte-identical to legacy.
  const logoSrc = waveP ? safeImageSrc(vars.coachLogoUrl) : null;
  const coachLogoImg = logoSrc
    ? `\n    <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(stripControlChars(vars.coachName ?? ""))}" style="display:block;border:0;outline:none;max-height:40px;max-width:200px;height:auto;width:auto;margin-top:12px;" />`
    : "";
  // CTA button (waveP: larger padding + font — label/colors/radius/weight unchanged).
  const ctaPadding = waveP ? "18px 40px" : "14px 30px";
  const ctaFontSize = waveP ? "17px" : "15px";
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
    <img src="cid:${SU_LOGO_CID}" alt="Scaling Up" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />${coachLogoImg}
    ${orgLine ? `<div style="margin-top:14px;font-size:13px;color:#ffffff;opacity:0.85;">${orgLine}</div>` : ""}
  </div>
  <div style="padding:28px 32px 8px;">
    ${bodyHtml}
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${escapeHtml(vars.invitationUrl)}" style="display:inline-block;background:${PURPLE};color:#ffffff;padding:${ctaPadding};text-decoration:none;border-radius:8px;font-weight:700;font-size:${ctaFontSize};">Start the assessment</a>
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

// ── Coach-logo resolver (Wave P) ────────────────────────────────────────────
type CoachLogo = { profileImage: string | null } | null;

/**
 * Resolve the coach logo for the Wave-P email chrome. Logo identity MIRRORS
 * `resolveCoachName`: pick = creator coach ?? org owner (the org owner IS a
 * Coach row), then take that coach's profileImage — so name and logo always
 * come from the same coach (a creator coach with no image does NOT fall
 * through to the owner's image).
 *
 * `logoRejectedReason` is PII-free observability for the send paths:
 *  - "no-coach"    — no coach picked at all
 *  - "no-image"    — the picked coach has no profileImage
 *  - "invalid-url" — profileImage present but fails the https-only `safeImageSrc` gate
 *  - null          — usable logo
 *
 * A rejected URL is returned as null (never the raw value) so a downstream
 * consumer logging the mailer payload can't leak an unvetted string.
 */
export function resolveCoachLogo(
  creatorCoach: CoachLogo,
  ownerCoach: CoachLogo,
): { coachLogoUrl: string | null; logoRejectedReason: "no-coach" | "no-image" | "invalid-url" | null } {
  const pick = creatorCoach ?? ownerCoach;
  if (!pick) return { coachLogoUrl: null, logoRejectedReason: "no-coach" };
  const coachLogoUrl = pick.profileImage ?? null;
  if (!coachLogoUrl) return { coachLogoUrl: null, logoRejectedReason: "no-image" };
  if (!safeImageSrc(coachLogoUrl)) return { coachLogoUrl: null, logoRejectedReason: "invalid-url" };
  return { coachLogoUrl, logoRejectedReason: null };
}
