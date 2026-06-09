/**
 * quick-assessment-lead.ts
 *
 * Pure helpers for the Scaling Up Quick Assessment lead-email flow.
 * No DB, no I/O, no network — all functions are deterministic and fully unit-tested.
 */

import { escapeHtml } from "@/lib/templates/interpolate-content-html";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainScore {
  key: string;
  label: string;
  averagePoints: number | null;
}

export interface DomainScoreInput {
  label: string;
  averagePoints: number | null;
}

export interface LowestDecisionResult {
  key: string;
  label: string;
  /** The Decision key immediately before the lowest in canonical order, or null if it is first. */
  precedingKey: string | null;
}

export type RecipientRole = "REFERRING_COACH" | "SU_TEAM";

export interface LeadRecipient {
  role: RecipientRole;
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Canonical Four Decisions order — immutable. */
const CANONICAL_ORDER: string[] = ["people", "strategy", "execution", "cash"];

// ---------------------------------------------------------------------------
// lowestDecision
// ---------------------------------------------------------------------------

/**
 * Returns the domain with the lowest `averagePoints`, ranked by canonical
 * Four Decisions order (people → strategy → execution → cash).
 *
 * - Null averagePoints are ignored.
 * - Ties resolve to the EARLIEST domain in the canonical order.
 * - Returns null if input is empty or all averagePoints are null.
 */
export function lowestDecision(
  perDomain: Array<{ key: string; label: string; averagePoints: number | null }>
): LowestDecisionResult | null {
  // Sort input by canonical position so that tie-breaking naturally favours the earliest.
  const indexed = perDomain
    .map((d) => ({
      ...d,
      canonicalIndex: CANONICAL_ORDER.indexOf(d.key),
    }))
    // Preserve only domains with a canonical position and a non-null score.
    .filter((d) => d.averagePoints !== null && d.canonicalIndex !== -1)
    // Sort by canonical position so the first entry in a tie wins.
    .sort((a, b) => a.canonicalIndex - b.canonicalIndex);

  if (indexed.length === 0) return null;

  // Find the minimum score while preserving canonical order (earliest wins on tie).
  let lowest = indexed[0];
  for (let i = 1; i < indexed.length; i++) {
    // strict < so ties keep the earlier entry (already sorted by canonicalIndex).
    if ((indexed[i].averagePoints as number) < (lowest.averagePoints as number)) {
      lowest = indexed[i];
    }
  }

  const precedingIndex = lowest.canonicalIndex - 1;
  const precedingKey =
    precedingIndex >= 0 ? CANONICAL_ORDER[precedingIndex] : null;

  return {
    key: lowest.key,
    label: lowest.label,
    precedingKey,
  };
}

// ---------------------------------------------------------------------------
// buildLeadEmail
// ---------------------------------------------------------------------------

/** Strip control characters (including \r \n \t and other C0/C1 chars) from a string. */
function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

export interface BuildLeadEmailInput {
  taker: { firstName: string; lastName: string; email: string };
  assessmentName: string;
  perDomain: Array<{ label: string; averagePoints: number | null }>;
  lowestLabel: string | null;
  recipientRole: RecipientRole;
}

export interface LeadEmailOutput {
  subject: string;
  bodyHtml: string;
}

/**
 * Builds a lead-notification email for a quick-assessment submission.
 *
 * Security guarantees:
 * - Every interpolated user value is HTML-escaped in bodyHtml.
 * - Control characters (including \r \n \t) are stripped from subject-line interpolations.
 */
export function buildLeadEmail(input: BuildLeadEmailInput): LeadEmailOutput {
  const { taker, assessmentName, perDomain, lowestLabel, recipientRole } =
    input;

  // --- Subject ---
  // Strip control chars from any value that goes into the subject to prevent header injection.
  const safeFirst = stripControlChars(taker.firstName);
  const safeLast = stripControlChars(taker.lastName);
  const safeAssessment = stripControlChars(assessmentName);

  const subject = `New ${safeAssessment} submission — ${safeFirst} ${safeLast}`;

  // --- Body HTML ---
  // All interpolated user values must be HTML-escaped.
  const escapedFirst = escapeHtml(taker.firstName);
  const escapedLast = escapeHtml(taker.lastName);
  const escapedEmail = escapeHtml(taker.email);
  const escapedAssessment = escapeHtml(assessmentName);

  const leadIn =
    recipientRole === "REFERRING_COACH"
      ? `One of your contacts just completed the <strong>${escapedAssessment}</strong>. Here is their score summary:`
      : `A new lead has completed the <strong>${escapedAssessment}</strong>. Their results are below:`;

  const domainRows = perDomain
    .map((d) => {
      const escapedLabel = escapeHtml(d.label);
      const score =
        d.averagePoints !== null ? d.averagePoints.toFixed(1) : "N/A";
      return `<tr>
        <td style="padding:4px 12px 4px 0; font-weight:500;">${escapedLabel}</td>
        <td style="padding:4px 0;">${score}</td>
      </tr>`;
    })
    .join("\n");

  const lowestLine =
    lowestLabel !== null
      ? `<p style="margin-top:16px;"><strong>Lowest Decision:</strong> ${escapeHtml(lowestLabel)}</p>`
      : `<p style="margin-top:16px;"><strong>Lowest Decision:</strong> N/A</p>`;

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${escapedAssessment} Lead</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:#522583;">${escapedAssessment} — New Submission</h2>
  <p>${leadIn}</p>
  <p>
    <strong>Name:</strong> ${escapedFirst} ${escapedLast}<br />
    <strong>Email:</strong> ${escapedEmail}
  </p>
  <h3 style="margin-bottom:8px;">Four Decisions Scores</h3>
  <table style="border-collapse:collapse;">
    <tbody>
${domainRows}
    </tbody>
  </table>
${lowestLine}
  <hr style="margin-top:32px;" />
  <p style="font-size:12px;color:#666;">This email was generated automatically by the Scaling Up Platform.</p>
</body>
</html>`;

  return { subject, bodyHtml };
}

// ---------------------------------------------------------------------------
// resolveLeadRecipients
// ---------------------------------------------------------------------------

/**
 * Resolves the list of email recipients for a lead notification.
 *
 * Always includes one SU_TEAM recipient.
 * Includes a REFERRING_COACH recipient only when `activeCoachEmail` is
 * non-null and non-empty after trimming.
 *
 * Emails are lowercased and trimmed.
 *
 * NOTE: This helper does NOT do any DB lookups — the caller is responsible
 * for resolving the active-coach email before calling this function.
 */
export function resolveLeadRecipients(input: {
  suTeamAddress: string;
  activeCoachEmail: string | null;
}): LeadRecipient[] {
  const recipients: LeadRecipient[] = [];

  const suEmail = input.suTeamAddress.trim().toLowerCase();
  const coachEmail = input.activeCoachEmail?.trim().toLowerCase() ?? "";

  recipients.push({ role: "SU_TEAM", email: suEmail });

  if (coachEmail.length > 0) {
    recipients.push({ role: "REFERRING_COACH", email: coachEmail });
  }

  return recipients;
}
