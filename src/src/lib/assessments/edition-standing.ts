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
 * broken — correctly, from what is on screen.
 *
 * That is the most likely MECHANISM behind two of Jeff's July-10 rows (#40, #43)
 * being re-reports of already-shipped work. Precision on the citation: the
 * CHANGELOG records that those rows re-reported work shipped 8 days earlier — it
 * does NOT record invisible pinning as the cause. The inference is ours, and it
 * rests on both rows being LVA wording asks while Wave P published LVA v3 on
 * 2026-07-02, so a campaign pinned to LVA v2 would still serve pre-Wave-P
 * wording.
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
  templateId: string;
  versionNumber: number;
  /** Null ⇒ the campaign is pinned to a draft (an anomaly — see below). */
  publishedAt: Date | null;
  language: string;
}

/** A sibling version, for the newer-edition comparison. */
export interface SiblingVersion {
  /** Checked here too — template scoping is the predicate that decides WHICH
   *  instrument we are comparing, so it must not be query-only. */
  templateId: string;
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
  /** True ⇒ show the "Not the latest edition" chip. */
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
 *  - it belongs to the SAME TEMPLATE — otherwise a different instrument's newer
 *    version would advertise itself here;
 *  - it is PUBLISHED — a draft is available to nobody;
 *  - it is NOT archived — Wave ED8 retirement means "do not use this";
 *  - it is the SAME language — versions are unique per
 *    `[templateId, versionNumber, language]`, so a Spanish edition 5 must never
 *    make an English edition 3 look behind;
 *  - its `versionNumber` is strictly greater than the pinned one.
 *
 * Every one of those predicates is ALSO applied by the caller's query. The
 * duplication is deliberate: it keeps the decision correct if the query is ever
 * loosened, and it is only sound because the caller passes the COMPLETE
 * candidate set (a `findFirst` would return an arbitrary row, so a loosened
 * query could hand back an archived one and this check would compute `false`).
 *
 * ⚠️ The duplication cuts BOTH ways, and the second direction is the dangerous
 * one. A loosened WHERE fails safe — this function rejects the extra rows. But a
 * narrowed SELECT fails toward the REASSURING answer: drop `versionNumber` from
 * the caller's projection and `Number.isFinite(undefined)` is false, so every
 * sibling is rejected, `newerEditionAvailable` computes `false`, and the tile
 * makes an affirmative "you are on the newest edition" claim. That is the same
 * failure mode as returning an empty sibling list on error, reached by a
 * different route. The caller's projection is therefore pinned by a test.
 *
 * Pure and never-throwing: a malformed or null sibling is skipped rather than
 * crashing the campaign screen, which must keep rendering whatever else it knows.
 *
 * KNOWN ASYMMETRY, deliberate and scoped out: a sibling is disqualified when it
 * is archived, but the PINNED version's own `archivedAt` is never consulted. So a
 * campaign serving an ED8-retired edition, with no newer published sibling,
 * renders an unqualified "Edition 3 · published …" and no chip — reassuring-
 * looking text about content an admin explicitly retired. Arguably more urgent
 * than "not the latest"; it needs its own copy and is tracked separately.
 */
export function resolveEditionStanding(
  pinned: PinnedVersion,
  siblings: readonly SiblingVersion[],
): EditionStanding | null {
  if (pinned.publishedAt == null) return null;
  if (!Number.isFinite(pinned.versionNumber)) return null;

  const newerEditionAvailable = siblings.some(
    (s) =>
      // Null-guard first: the docblock promises never-throwing, and a null
      // element would otherwise TypeError on the first property access.
      s != null &&
      s.templateId === pinned.templateId &&
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
