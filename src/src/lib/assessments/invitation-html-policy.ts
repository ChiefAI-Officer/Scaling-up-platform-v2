export const INVITATION_URL_TOKENS = [
  "invitationUrl",
  "invitation_url",
  "assessmentUrl",
  "assessment_url",
] as const;

const URL_TOKEN_STEMS = new Set(["invitationurl", "assessmenturl"]);
const TOKEN_GLOBAL_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function isInvitationUrlTokenName(raw: string): boolean {
  return URL_TOKEN_STEMS.has(raw.toLowerCase().replace(/_/g, ""));
}

export function countInvitationUrlTokens(raw: string): number {
  let count = 0;
  for (const match of raw.matchAll(TOKEN_GLOBAL_RE)) {
    if (isInvitationUrlTokenName(match[1])) count += 1;
  }
  return count;
}

export function hasInvitationUrlToken(raw: string): boolean {
  return countInvitationUrlTokens(raw) > 0;
}

export function isWholeInvitationUrlToken(raw: string): boolean {
  const match = /^\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}$/.exec(raw.trim());
  return match !== null && isInvitationUrlTokenName(match[1]);
}

export type InvitationHtmlMode =
  | "none"
  | "full_replace"
  | "branded_body"
  | "branded_fallback";

export function resolveInvitationHtmlMode(input: {
  waveDCustomHtmlEnabled: boolean;
  brandedCustomHtmlEnabled: boolean;
  rawHtml: string | null | undefined;
}): InvitationHtmlMode {
  const rawHtml =
    typeof input.rawHtml === "string" && input.rawHtml.trim().length > 0
      ? input.rawHtml
      : null;
  if (!input.waveDCustomHtmlEnabled || rawHtml === null) return "none";
  if (input.brandedCustomHtmlEnabled) return "branded_body";
  return hasInvitationUrlToken(rawHtml) ? "full_replace" : "branded_fallback";
}
