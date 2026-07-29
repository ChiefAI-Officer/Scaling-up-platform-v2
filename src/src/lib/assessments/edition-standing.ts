/**
 * Wave EV — is this campaign serving the newest edition of its template?
 *
 * WHY THIS EXISTS
 * ───────────────
 * A campaign pins one `AssessmentTemplateVersion` at creation
 * (`assessment-campaigns/route.ts`) and there is **no write path to change it** —
 * the PATCH route only ever reads `versionId`. That pinning is correct: a live
 * campaign must not have its questions change underneath the people answering
 * it, and issued reports are stamped with their version's contentHash.
 *
 * What was wrong is that the pinning was **invisible**. The campaign screen shows
 * the template's NAME ("Quarterly Session Prep v2" — where "v2" is part of the
 * instrument's name, a different product from v1, NOT an edition) and nothing
 * about which edition of it is being served. So a tester opens a campaign
 * created before a fix published, reads the old wording, and reports it as
 * broken — correctly, from what is on screen. That is the documented cause of
 * two of Jeff's July-10 rows (#40, #43) being re-reports of shipped work.
 *
 * This module is the pure decision behind the fix; the query lives in
 * `campaign-detail.ts` and the rendering in `CampaignDetail.tsx`.
 *
 * "Edition" is the customer-facing word, deliberately not "version": the word
 * "version" is already spent on the instrument's own name in front of coaches,
 * and reusing it is how this became confusing in the first place.
 */

/** The version a campaign is pinned to. */
export interface PinnedVersion {
  versionNumber: number;
  /** Null ⇒ the campaign is pinned to a draft (an anomaly — see below). */
  publishedAt: Date | null;
  language: string;
}

/** A sibling version of the same template, for the newer-edition comparison. */
export interface SiblingVersion {
  versionNumber: number;
  language: string;
  publishedAt: Date | null;
  /** Wave ED8: a retired published version. Retired ⇒ not "available". */
  archivedAt: Date | null;
}

export interface EditionStanding {
  /** The edition this campaign is ACTUALLY serving — never the newest one. */
  versionNumber: number;
  publishedAt: Date;
  /** True ⇒ show the "Newer edition available" chip. */
  newerEditionAvailable: boolean;
}

/**
 * Resolve what the campaign screen should say about the pinned edition.
 *
 * Returns `null` when the pinned version has no `publishedAt` — a campaign on an
 * unpublished version is an anomaly, and printing an edition number for it would
 * assert a fact we cannot stand behind. The caller renders nothing in that case,
 * leaving the tile exactly as it is today.
 *
 * A sibling only counts as a newer edition when ALL of these hold:
 *  - it is PUBLISHED — a draft is available to nobody;
 *  - it is NOT archived — Wave ED8 retirement means "do not use this";
 *  - it is the SAME language — versions are unique per
 *    `[templateId, versionNumber, language]`, so a Spanish edition 5 must never
 *    make an English edition 3 look behind;
 *  - its `versionNumber` is strictly greater than the pinned one.
 *
 * Pure and never-throwing: a malformed sibling is skipped rather than crashing
 * the campaign screen, which must keep rendering whatever else it knows.
 */
export function resolveEditionStanding(
  pinned: PinnedVersion,
  siblings: readonly SiblingVersion[],
): EditionStanding | null {
  if (pinned.publishedAt == null) return null;
  if (!Number.isFinite(pinned.versionNumber)) return null;

  const newerEditionAvailable = siblings.some(
    (s) =>
      s.publishedAt != null &&
      s.archivedAt == null &&
      s.language === pinned.language &&
      Number.isFinite(s.versionNumber) &&
      s.versionNumber > pinned.versionNumber,
  );

  return {
    versionNumber: pinned.versionNumber,
    publishedAt: pinned.publishedAt,
    newerEditionAvailable,
  };
}
