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
 * AUTHORIZATION lives in the CALLER, not here
 * ───────────────────────────────────────────
 * A stored slot is NOT a credential. The client must only rehydrate from it after
 * `/me` has answered **410** — which proves a live invitation cookie whose
 * invitation is past its lifecycle gate. Reading the slot before that check would
 * serve a full report (name, answers, scores) to whoever next reloads the tab,
 * with no credential at all. See the review of PR #236.
 *
 * This module still defends in depth: the envelope is stamped with `issuedAt` and
 * expires on the same clock as the invitation cookie (1740s), so an abandoned tab
 * stops being able to re-render even if a caller forgets the `/me` gate.
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
  /** Epoch ms at write time — drives the expiry below. */
  issuedAt: number;
  report: unknown;
}

const ENVELOPE_VERSION = 1;

/**
 * Slot lifetime, matched to the invitation cookie's `maxAge`
 * (invitation-cookie.ts COOKIE_MAX_AGE_SECONDS = 1740). Beyond it the respondent
 * could not have re-authenticated anyway, so a readable report is pure exposure.
 */
const MAX_AGE_MS = 1_740_000;

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
    const envelope: StoredEnvelope = {
      v: ENVELOPE_VERSION,
      issuedAt: Date.now(),
      report,
    };
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

  // A slot written by a future shape must never be handed to the renderer.
  if (envelope.v !== ENVELOPE_VERSION) {
    clearOnScreenResult(campaignAlias);
    return null;
  }

  // Defense in depth behind the caller's /me 410 gate: an abandoned tab stops
  // rendering once the respondent could no longer have re-authenticated.
  if (
    typeof envelope.issuedAt !== "number" ||
    !Number.isFinite(envelope.issuedAt) ||
    Date.now() - envelope.issuedAt > MAX_AGE_MS
  ) {
    clearOnScreenResult(campaignAlias);
    return null;
  }

  return reviveOnScreenReport(envelope.report);
}

/**
 * Revive a `RespondentReport` that has crossed a JSON boundary.
 *
 * `submittedAt` is typed as a `Date` but round-trips as an ISO string, and the
 * report renderers hand it to `Intl.DateTimeFormat`, which throws `RangeError` on
 * a string and falls back to printing the raw ISO text. BOTH boundaries need
 * this: the submit response (server → client) and this sessionStorage slot.
 * Returns null for anything that is not a report-shaped object.
 */
export function reviveOnScreenReport(
  report: unknown,
): RespondentReport | null {
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
