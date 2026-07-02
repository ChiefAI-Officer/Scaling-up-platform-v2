/**
 * Wave P (Jeff item #5) — respondent display-name fallback helpers.
 *
 * When a respondent's roster/quiz name is blank, coach-facing surfaces (the
 * completion-email subject, "Your client <strong>…</strong>" prefaces, report
 * covers) must show the respondent's EMAIL — never a leading-space subject,
 * an empty <strong></strong>, or a generic like "a responder".
 *
 * Respondent-facing greetings ("Dear …", "Keep scaling, …") are the opposite:
 * an email address must NEVER appear there, so they keep the existing "there"
 * degradation — including when the display name IS the email fallback.
 *
 * Both functions are pure; safe to import from server code, email builders,
 * and client components alike.
 */

/**
 * Full display name for a respondent: first+last joined and trimmed, falling
 * back to the trimmed email when the name is blank, else "".
 *
 * CRITICAL: trims BEFORE truthiness testing — joining two empty name fields
 * with a space yields " ", a truthy single space that previously leaked into
 * subjects/prefaces as a leading space.
 */
export function respondentDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = `${(firstName ?? "").trim()} ${(lastName ?? "").trim()}`.trim();
  if (name !== "") return name;
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail !== "") return trimmedEmail;
  return "";
}

/**
 * Respondent-facing greeting token: the first whitespace token of the trimmed
 * display name. Degrades to "there" when blank OR when the value contains "@"
 * — an email address (the display-name fallback) must never be used as a
 * greeting ("Dear jane@example.com" is worse than "Dear there").
 */
export function greetingName(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  if (trimmed === "" || trimmed.includes("@")) return "there";
  return trimmed.split(/\s+/)[0];
}
