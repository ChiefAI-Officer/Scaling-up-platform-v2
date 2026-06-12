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
