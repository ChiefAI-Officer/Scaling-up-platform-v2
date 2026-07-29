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
 * KEYING — campaign alias for the SLOT, respondentKey for the OWNER
 * ─────────────────────────────────────────────────────────────────
 * The slot is keyed by campaign alias, because on the refresh being rehydrated
 * the client has not yet had a 200 from `/me` and so has no `respondentKey` of
 * its own to key by. The owner is therefore carried INSIDE the envelope and
 * checked on read (see `readOnScreenResult`).
 *
 * ⚠️ AN EARLIER REVISION OF THIS COMMENT WAS WRONG — DO NOT RESTORE IT.
 * It claimed "a fresh token exchange MUST clear the slot" was the load-bearing
 * rule, reasoning that a second invitee can only reach the survey in the same
 * tab by arriving with a new `#t=` link. Two independent holes:
 *   1. The exchange STRIPS the fragment, so a plain reload of
 *      `/org-survey/{alias}` never re-enters the exchange branch at all — the
 *      tokenless reload is the COMMON path, not an exotic one.
 *   2. `sessionStorage` is per-TAB while cookies are per-origin. A second
 *      invitee exchanging in a DIFFERENT tab replaces the shared cookie but
 *      purges only their own tab, leaving the first respondent's report intact
 *      in the first tab.
 * The exchange purge is now belt-and-braces cleanup only.
 *
 * AUTHORIZATION lives in the CALLER; OWNERSHIP is enforced here
 * ────────────────────────────────────────────────────────────
 * A stored slot is NOT a credential. Two separate checks are required, and
 * neither is sufficient alone:
 *   • The CALLER must only rehydrate after `/me` answers **410**, which proves a
 *     live sealed invitation cookie (that route returns 401 for a missing or
 *     mismatched cookie BEFORE it evaluates any lifecycle gate).
 *   • THIS MODULE must then confirm the stored report belongs to the invitation
 *     that cookie identifies — `readOnScreenResult` takes the `respondentKey`
 *     echoed by the 410 and refuses (and purges) on mismatch. Without it, "a
 *     live invitation exists in this browser" would be silently accepted as
 *     "this is the person the report is about".
 *
 * Defense in depth: the envelope is stamped with `issuedAt` and expires after
 * `MAX_AGE_MS`, so an abandoned tab eventually stops re-rendering even if a
 * caller forgets the `/me` gate entirely.
 *
 * ⚠️ RESIDUAL RISK, ACCEPTED AND NOT CLOSED BY THE ABOVE: a respondent who
 * submits and then walks away from their OWN unlocked browser leaves a readable
 * report until the invitation cookie lapses (≤29 min from exchange). The
 * attacker there holds both the cookie and the slot, so no server-side check can
 * distinguish them from the respondent. This is the same exposure as leaving any
 * logged-in session open, and is bounded, not prevented.
 *
 * Every function is defensive and never throws: Safari private mode can throw on
 * `setItem`, and a corrupt slot must degrade to "no stored report" rather than
 * white-screening a respondent who has already submitted.
 */

import type { RespondentReport } from "./respondent-report";

const PREFIX = "su-onscreen-result:";

/** Stored envelope. Versioned so a future shape change can be detected. */
interface StoredEnvelope {
  v: 2;
  /** Epoch ms at write time — drives the expiry below. */
  issuedAt: number;
  /**
   * The opaque invitation cuid this report belongs to. Compared on read against
   * the key echoed by `/me`'s 410 so one respondent's report can never render to
   * a different invitation sharing the browser. Not PII.
   */
  respondentKey: string;
  report: unknown;
}

/**
 * Bumped 1 → 2 when `respondentKey` was added. A v1 envelope has no owner
 * recorded, so it can never be proven to belong to the reader and is discarded
 * on sight rather than trusted — which is also why the bump is required rather
 * than optional.
 */
const ENVELOPE_VERSION = 2;

/**
 * Slot lifetime. The MAGNITUDE matches the invitation cookie's `maxAge`
 * (invitation-cookie.ts COOKIE_MAX_AGE_SECONDS = 1740) but the EPOCH does not:
 * the cookie's clock starts at token exchange and is never re-saved, while
 * `issuedAt` starts at submit, which is always later. So the cookie always
 * lapses first, and in the `/me`-gated flow this bound is never the binding
 * constraint — it exists for the "a caller forgot the gate" case, where it caps
 * exposure instead of leaving it open for the tab's whole lifetime.
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
  respondentKey: string,
): void {
  const store = storage();
  if (!store) return;
  // An unattributable report cannot be safely re-read, so refuse to store one
  // rather than write a slot that read() will always reject.
  if (!respondentKey) return;
  try {
    const envelope: StoredEnvelope = {
      v: ENVELOPE_VERSION,
      issuedAt: Date.now(),
      respondentKey,
      report,
    };
    store.setItem(onScreenResultKey(campaignAlias), JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded. Non-fatal by design.
  }
}

/**
 * Read back a stored report, or `null` when absent, unreadable, malformed,
 * expired, or **owned by a different invitation**.
 *
 * `expectedRespondentKey` MUST be the key echoed by `/me`'s 410 — i.e. the
 * invitation the caller's cookie actually identifies. A mismatch means the slot
 * belongs to someone else who used this browser, and is both refused and purged.
 * Passing a blank key refuses too; there is deliberately no "skip the check"
 * path, because an optional ownership check is one careless caller away from
 * being no check at all.
 *
 * `submittedAt` is revived to a real `Date`: it round-trips through JSON as an
 * ISO string, and the report renderers format it as a Date.
 */
export function readOnScreenResult(
  campaignAlias: string,
  expectedRespondentKey: string,
): RespondentReport | null {
  const store = storage();
  if (!store) return null;
  if (!expectedRespondentKey) return null;

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

  // A slot written by a different shape must never be handed to the renderer.
  // This also discards pre-ownership (v1) envelopes, which carry no owner and
  // therefore cannot be proven to belong to the reader.
  if (envelope.v !== ENVELOPE_VERSION) {
    clearOnScreenResult(campaignAlias);
    return null;
  }

  // OWNERSHIP. The caller's 410 proves a live invitation cookie in this browser;
  // it does NOT prove that invitation owns this slot (sessionStorage is per-tab,
  // cookies are per-origin). Refuse anything we cannot attribute to the reader.
  if (
    typeof envelope.respondentKey !== "string" ||
    envelope.respondentKey === "" ||
    envelope.respondentKey !== expectedRespondentKey
  ) {
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
 * Drop any stored report for this campaign.
 *
 * Called on a fresh token exchange, on a `/me` response that disproves a live
 * session, and by `readOnScreenResult` whenever a slot fails validation.
 *
 * ⚠️ This purge is NOT the boundary that keeps respondents apart — an earlier
 * comment here said it was. See the keying note at the top of this file for the
 * two reasons that was wrong. Separation is enforced by the ownership check in
 * `readOnScreenResult`; this is hygiene.
 */
export function clearOnScreenResult(campaignAlias: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(onScreenResultKey(campaignAlias));
  } catch {
    // Nothing to do. An unremovable slot is still safe: it cannot render unless
    // its recorded respondentKey matches the reader's own, freshly proven key.
  }
}
