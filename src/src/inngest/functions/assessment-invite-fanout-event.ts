/**
 * Assessment invite fan-out — event name constant (Wave D).
 *
 * Lives in its own module (no `inngest.createFunction` at import time) so
 * non-Inngest callers — e.g. the campaign-create POST route's post-commit
 * emit — can import the event name WITHOUT evaluating the fan-out function
 * definition (which would require a fully-wired Inngest client). The fan-out
 * module re-exports this for backward-compatible imports.
 *
 * SEC-M5: the fan-out trigger payload is `{ campaignId }` ONLY.
 */
export const ASSESSMENT_SEND_INVITES_EVENT =
  "assessment/campaign.send-invites" as const;
