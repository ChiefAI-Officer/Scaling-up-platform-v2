export const REPORT_PLACEHOLDERS = [
  {
    token: "{{respondentFirstName}}",
    label: "First name",
    description:
      "First name from the respondent record. Uses “there” when unavailable.",
  },
  {
    token: "{{respondentName}}",
    label: "Full name",
    description:
      "Full name from the respondent record. May use their email when a name is unavailable.",
  },
  {
    token: "{{companyName}}",
    label: "Company name",
    description:
      "Organization attached to the campaign. Blank when unavailable.",
  },
] as const;

export type ReportPlaceholderToken =
  (typeof REPORT_PLACEHOLDERS)[number]["token"];

const SUPPORTED_REPORT_PLACEHOLDERS = new Set<string>(
  REPORT_PLACEHOLDERS.map((field) => field.token),
);

function joinTokens(
  tokens: readonly string[],
  conjunction: "and" | "or" = "and",
): string {
  if (tokens.length === 1) return tokens[0];
  if (tokens.length === 2) return `${tokens[0]} ${conjunction} ${tokens[1]}`;
  return `${tokens.slice(0, -1).join(", ")}, ${conjunction} ${tokens.at(-1)}`;
}

export function unsupportedReportPlaceholders(raw: string): string[] {
  const unsupported: string[] = [];
  const seen = new Set<string>();
  for (const token of raw.match(/{{[^{}]*}}/g) ?? []) {
    if (SUPPORTED_REPORT_PLACEHOLDERS.has(token) || seen.has(token)) continue;
    seen.add(token);
    unsupported.push(token);
  }
  return unsupported;
}

export function reportPlaceholderIssue(
  raw: string,
  fieldLabel: string,
): string | null {
  const unsupported = unsupportedReportPlaceholders(raw);
  if (unsupported.length === 0) return null;

  const noun = unsupported.length === 1 ? "placeholder" : "placeholders";
  const supported = joinTokens(
    REPORT_PLACEHOLDERS.map((field) => field.token),
    "or",
  );
  return `${fieldLabel} contains unsupported ${noun} ${joinTokens(unsupported)}. Use ${supported}.`;
}
