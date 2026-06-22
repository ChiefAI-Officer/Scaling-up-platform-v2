/**
 * Default assessment-invitation body + subject constants (Wave G).
 *
 * BUNDLE SAFETY — this module MUST stay dependency-free (import NOTHING) and
 * side-effect-free. It is imported by BOTH:
 *   - the server-only email renderer (lib/assessments/invitation-email.ts), and
 *   - the CLIENT campaign wizard React component.
 *
 * The server renderer pulls in Buffer / sanitize-html / a CID logo, so these
 * defaults cannot live there: a client import of that module would drag those
 * server-only deps into the browser bundle. Keeping the constants in this tiny,
 * import-free module lets both sides share one source of truth safely.
 *
 * The body uses ONLY tokens that resolve via the existing invitation token
 * system with neutral fallbacks. It intentionally contains NO link/CTA of its
 * own — the branded shell and the legacy renderer each append their own
 * "Start the assessment" CTA button, and the plain-text renderer appends the
 * link.
 */

export const DEFAULT_INVITATION_BODY = `Hi {{respondentFirstName}},

You've been invited to complete the {{templateName}} for {{organizationName}}.

It takes just a few minutes, and there are no right or wrong answers — your honest perspective is what makes the results useful. Your responses are confidential.

Click the button below to begin.`;

/**
 * STATIC, token-FREE subject — deliberately carries no tokens so it is safe on
 * every render path regardless of subject-allowlist behavior.
 */
export const DEFAULT_INVITATION_SUBJECT = "Your Scaling Up assessment invitation";

/**
 * Identifier emitted in send telemetry so on-call can tell which default
 * version was used.
 */
export const DEFAULT_INVITATION_VERSION = "wave-g-1";
