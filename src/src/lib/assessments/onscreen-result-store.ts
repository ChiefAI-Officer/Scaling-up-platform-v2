/**
 * Wave OSR (Jeff #71) — per-tab persistence for the invited respondent's
 * in-place Results report. Spec: docs/specs/v7.6/19an §4.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The report is shown once, in place, from the submit response — there is no
 * durable results URL (that would need respondent authorization built from
 * scratch; see spec 19an §4 options ii/iii). But "show once" must not mean
 * "break the browser": `/me` returns 410 as soon as the invitation is SUBMITTED
 * (me/route.ts), and the survey client renders 410 as "This survey has closed."
 * So without a rehydrate, a respondent who refreshes — or hits Back — is told
 * the survey closed seconds after they finished it.
 *
 * `sessionStorage` fixes that with no new route, no PII endpoint and no
 * authorization question: the data never leaves the respondent's own tab, and it
 * dies when that tab closes, which IS show-once. It is strictly narrower than
 * the answer draft already shipping in `use-answer-draft.ts`, which persists the
 * respondent's raw ANSWERS to `localStorage` (wider scope, longer life).
 *
 * KEYING — and why it is the campaign alias
 * ─────────────────────────────────────────
 * The answer draft keys off the opaque per-respondent `respondentKey` from
 * `/me`. This store CANNOT: on the refresh we are rehydrating for, `/me` has
 * already 410'd, so `respondentKey` is unavailable. The only identifier in hand
 * is the campaign alias from the URL.
 *
 * That makes one purge rule load-bearing: a fresh token exchange MUST clear the
 * slot. A second invitee can only reach the survey in the same tab by arriving
 * with a new `#t=` link, so clearing on exchange is exactly the moment that
 * prevents them being shown the previous respondent's report.
 *
 * Every function is defensive and never throws: Safari private mode can throw on
 * `setItem`, and a corrupt slot must degrade to "no stored report" rather than
 * white-screening a respondent who has already submitted.
 */

import type { RespondentReport } from "./respondent-report";

const PREFIX = "su-onscreen-result:";

/** Stored envelope. Versioned so a future shape change can be detected. */
interface StoredEnvelope {
  v: 1;
  report: unknown;
}

/**
 * sessionStorage key for a campaign's on-screen result. Namespaced so it can
 * never collide with the answer draft or any other consumer.
 */
export function onScreenResultKey(campaignAlias: string): string {
  return `${PREFIX}${campaignAlias}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    // Accessing sessionStorage can itself throw when storage is blocked.
    return null;
  }
}

/**
 * Persist the server-built report for this tab. Never throws — a storage
 * failure only costs the refresh-survival, never the render in front of the
 * respondent right now.
 */
export function writeOnScreenResult(
  campaignAlias: string,
  report: RespondentReport,
): void {
  const store = storage();
  if (!store) return;
  try {
    const envelope: StoredEnvelope = { v: 1, report };
    store.setItem(onScreenResultKey(campaignAlias), JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded. Non-fatal by design.
  }
}

/**
 * Read back a stored report, or `null` when absent, unreadable or malformed.
 *
 * `submittedAt` is revived to a real `Date`: it round-trips through JSON as an
 * ISO string, and the report renderers format it as a Date.
 */
export function readOnScreenResult(
  campaignAlias: string,
): RespondentReport | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(onScreenResultKey(campaignAlias));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const envelope = parsed as Partial<StoredEnvelope>;
  const report = envelope.report;
  if (typeof report !== "object" || report === null) return null;

  const revived = report as RespondentReport & { submittedAt?: unknown };
  if (typeof revived.submittedAt === "string") {
    const asDate = new Date(revived.submittedAt);
    if (!Number.isNaN(asDate.getTime())) revived.submittedAt = asDate;
  }
  return revived as RespondentReport;
}

/**
 * Drop any stored report for this campaign. Called on a fresh token exchange
 * (see the keying note above) — that purge is what keeps one respondent's
 * report from ever being shown to the next person in the same tab.
 */
export function clearOnScreenResult(campaignAlias: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(onScreenResultKey(campaignAlias));
  } catch {
    // Nothing to do — an unremovable slot is still gated by the exchange purge.
  }
}
