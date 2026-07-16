/**
 * Assessment v7.6 / Wave ED8 — the single definition of an "Active" version.
 *
 * ACTIVE = the highest `versionNumber` row for a (templateId, language) pair
 * that is BOTH published (`publishedAt IS NOT NULL`) AND non-archived
 * (`archivedAt IS NULL`). This file is the ONE place that definition lives;
 * every read path that must pick "the version campaigns will use" resolves it
 * through here so Active can never drift between call sites.
 *
 * Known drift this canonicalizes (spec 19ak §4):
 *   - campaign-create (`campaign-create-service.ts`) selects the latest
 *     published version by `versionNumber: "desc"`.
 *   - trends (`trends.ts`) selects "latest" by `publishedAt: "desc"` (ties
 *     broken by versionNumber). Trends KEEPS its own publishedAt-desc
 *     selection — it only gains the `archivedAt: null` filter in T3; it does
 *     NOT adopt this helper's ordering.
 *   So the two orderings are deliberately different; this helper encodes the
 *   campaign-create-style (versionNumber desc) Active used by the resolver
 *   paths, and `activePublishedWhere` is the shared filter both can spread.
 *
 * Wave-Q doctrine: archived-exclusion is PERSISTED admin intent (an archived
 * version is data the admin retired), so it is expressed in the DB `where` and
 * is NEVER flag-gated. The ED8 lifecycle flag gates only the WRITE endpoints +
 * new UI, not this read-path filter.
 *
 * C4 finding (co-validate): before ED8, `version-sections/route.ts` defaulted
 * the language to `"en"` while campaign-create defaulted to `"enUS"`. Against
 * real data — every seeded published `AssessmentTemplateVersion` row carries
 * `language: "enUS"` (SU-Full, SU-Quick, 5-Dysfunctions, QSP-v1/v2, LVA,
 * Rockefeller) — `"en"` resolves a DIFFERENT (empty) row set than campaign
 * create, which would break the wizard's `expectedVersionId` hand-off.
 * `DEFAULT_TEMPLATE_LANGUAGE` centralizes the correct value; the two call
 * sites are converged onto it in T3 (this file only exports it).
 */

/**
 * Centralized default template language. Matches the real data convention:
 * every seeded published version row is `"enUS"`, and the production
 * campaign-create path resolves with `"enUS"`. See the C4 note above.
 */
export const DEFAULT_TEMPLATE_LANGUAGE = "enUS";

/**
 * Shared Prisma `where` fragment for an Active version: published AND
 * non-archived. `as const` keeps `publishedAt.not` / `archivedAt` as literal
 * `null`, so it spreads cleanly into a Prisma `where` clause alongside a
 * `templateId` / `language` filter.
 */
export const activePublishedWhere = {
  publishedAt: { not: null },
  archivedAt: null,
} as const;

/** The projection every Active-version query returns. */
export interface ActiveVersionRow {
  id: string;
  language: string;
  versionNumber: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
}

/**
 * Minimal Prisma-shape client — mirrors the `CampaignCreateDb` /
 * `AccessControlDb` pattern so unit tests can stub `findFirst` without pulling
 * in `@prisma/client`, and the real client satisfies it structurally (it is
 * already passed to the analogous `resolvePublishedTemplateVersion`).
 */
export interface ActiveVersionDb {
  assessmentTemplateVersion: {
    findFirst: (args: {
      where: {
        templateId: string;
        language: string;
        publishedAt: { not: null };
        archivedAt: null;
      };
      orderBy: { versionNumber: "desc" };
    }) => Promise<ActiveVersionRow | null>;
  };
}

/**
 * Resolve the Active version for a (templateId, language) pair: the highest
 * `versionNumber` row that is published AND non-archived, or `null` when none
 * exists. Never throws.
 */
export async function resolveActiveVersion(
  db: ActiveVersionDb,
  templateId: string,
  language: string,
): Promise<ActiveVersionRow | null> {
  return db.assessmentTemplateVersion.findFirst({
    where: {
      templateId,
      language,
      ...activePublishedWhere,
    },
    orderBy: { versionNumber: "desc" },
  });
}
