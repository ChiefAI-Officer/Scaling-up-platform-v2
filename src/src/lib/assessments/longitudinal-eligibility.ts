/**
 * Assessment v7.6 — Wave N — hasComparableLongitudinal()
 *
 * The cheap eligibility predicate that gates BOTH per-respondent-longitudinal
 * ENTRY LINKS (per-respondent report "View across campaigns" + CampaignDetail
 * respondent-list "over time") and aligns 1:1 with the direct route's own
 * gating. It answers a single yes/no: "should this person, for this scored
 * template, in this org, see an entry link to the longitudinal view right now?"
 *
 * Eligibility rule (18mn plan item 14, R1-Med-4 / R2-High-2):
 *   1. The feature flag is on for the org/template
 *      (`isRespondentLongitudinalEnabled`).
 *   2. The template's report type is "scored" (qualitative templates have a
 *      near-empty frozen result → nothing to trend; ADR-0016).
 *   3. The actor CURRENTLY passes `canAccessTemplate` (a coach who LOST template
 *      access must not be offered a link into that template's named PII).
 *   4. The person has **≥2 scored submissions for this template** — NOT ≥2
 *      same-version (so the all-different-versions value table still surfaces).
 *
 * This is a COUNT, never the full loader. It MIRRORS the loader's email-union
 * matching (`respondent-longitudinal.ts` §3 / GM-6) — union the LIVE same-org
 * OrgRespondent rows sharing the entry respondent's `normalizedEmail`, falling
 * back to the single entry id when there is no email — then COUNTS submissions
 * for those ids on this template (submitted, live campaign). It deliberately
 * does NOT read frozen result JSON, partition versions, or project rows.
 *
 * Never throws on the deny path: an unknown/cross-org/soft-deleted entry id,
 * missing email rows, or a flag-off env all resolve to `false`. The order is
 * cheapest-first (flag → scored → template-access → DB count) so the common
 * flag-off / qualitative cases short-circuit before any DB read.
 *
 * Spec refs:
 *  - docs/specs/v7.6/18n-wave-n-respondent-longitudinal-design.md §5 (entry
 *    points: ≥2 comparable submissions, `prefetch={false}`).
 *  - docs/specs/v7.6/18mn-wave-mn-implementation-plan.md item 14.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import { canAccessTemplate, asAccessDb } from "@/lib/assessments/access-control";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { isRespondentLongitudinalEnabled } from "@/lib/assessments/wave-n-flags";

// The email-union can fan out on a large/duplicated org. Bound the matched-row
// fetch (mirrors respondent-longitudinal.ts MAX_MATCHED_RESPONDENTS) — counting
// over a capped id set is still correct for the ≥2 threshold (we only need to
// know whether at least 2 exist; capping ids only ever lowers the count, and
// the loader applies the same cap, so the link stays consistent with the view).
export const MAX_MATCHED_RESPONDENTS = 50;

/** The minimum scored submissions required to offer a comparison. */
export const MIN_COMPARABLE_SUBMISSIONS = 2;

// ────────────────────────────────────────────────────────────────────────
// Narrow Prisma-shape DB interface — accepts the real Prisma client AND a
// transaction client. Only the delegates this predicate reads are listed; the
// access-control predicate takes its own narrow DB (AccessControlDb) bridged
// via asAccessDb. Tests stub against this interface, never the full Prisma type.
// ────────────────────────────────────────────────────────────────────────

interface EligibilityOrgRespondentRow {
  id: string;
  organizationId: string;
  normalizedEmail: string | null;
  deletedAt: Date | null;
}

export interface LongitudinalEligibilityDb {
  orgRespondent: {
    findFirst: (args: {
      where: {
        id: string;
        organizationId: string;
        deletedAt?: Date | null;
      };
    }) => Promise<EligibilityOrgRespondentRow | null>;
    findMany: (args: {
      where: {
        organizationId: string;
        normalizedEmail?: string;
        deletedAt?: Date | null;
      };
      take?: number;
    }) => Promise<EligibilityOrgRespondentRow[]>;
  };
  assessmentSubmission: {
    count: (args: {
      where: {
        respondentId: { in: string[] };
        submittedAt: { not: null };
        campaign: {
          templateId: string;
          deletedAt: Date | null;
        };
      };
    }) => Promise<number>;
  };
}

export interface HasComparableLongitudinalArgs {
  organizationId: string;
  respondentId: string;
  templateId: string;
  /** AssessmentTemplate.alias — drives the scored-only scope gate. */
  templateAlias: string | null | undefined;
}

/**
 * True ONLY when ALL hold:
 *  - `isRespondentLongitudinalEnabled({ organizationId, templateId })`
 *  - `reportConfigFor(templateAlias).reportType === "scored"`
 *  - `canAccessTemplate(db, actor, templateId)` (current access)
 *  - ≥2 scored submissions for this template by the email-union person.
 *
 * Never throws: any deny condition → `false`.
 */
export async function hasComparableLongitudinal(
  db: LongitudinalEligibilityDb,
  actor: ApiActor,
  args: HasComparableLongitudinalArgs,
): Promise<boolean> {
  const { organizationId, respondentId, templateId, templateAlias } = args;

  // 1. Flag — cheapest, no DB. Default-OFF / kill / non-matching ⇒ false.
  if (!isRespondentLongitudinalEnabled({ organizationId, templateId })) {
    return false;
  }

  // 2. Scored-only scope gate — qualitative templates have nothing to trend.
  if (reportConfigFor(templateAlias).reportType !== "scored") {
    return false;
  }

  // 3. Current template access — a coach who LOST template access must not be
  //    offered a link into that template's named PII (R2-High-2). Admin/STAFF
  //    bypass inside canAccessTemplate.
  const templateOk = await canAccessTemplate(asAccessDb(db), actor, templateId);
  if (!templateOk) return false;

  // 4. Entry-respondent org-bind (R2-High-1) — the path respondentId MUST be a
  //    LIVE OrgRespondent in this org. A stale / cross-org / soft-deleted id
  //    must never seed the identity union ⇒ false (no link).
  const entry = await db.orgRespondent.findFirst({
    where: { id: respondentId, organizationId, deletedAt: null },
  });
  if (!entry) return false;

  // 5. Match by normalizedEmail-within-org (GM-6) — union the LIVE same-org rows
  //    sharing the entry respondent's email; fall back to the single entry id.
  let matchedIds: string[];
  if (entry.normalizedEmail && entry.normalizedEmail.trim() !== "") {
    const sameEmailRows = await db.orgRespondent.findMany({
      where: {
        organizationId,
        normalizedEmail: entry.normalizedEmail,
        deletedAt: null,
      },
      take: MAX_MATCHED_RESPONDENTS,
    });
    const idSet = new Set<string>();
    // Always include the entry id even if a stub omitted it from findMany.
    idSet.add(entry.id);
    for (const r of sameEmailRows) {
      // Defense-in-depth: re-assert org + live even if a stub didn't filter.
      if (r.organizationId === organizationId && r.deletedAt === null) {
        idSet.add(r.id);
      }
    }
    matchedIds = [...idSet];
  } else {
    matchedIds = [entry.id];
  }
  // Deterministic cap (mirrors the loader): only ever lowers the count.
  matchedIds.sort();
  const cappedMatchedIds = matchedIds.slice(0, MAX_MATCHED_RESPONDENTS);

  // 6. COUNT scored submissions for this template (submitted, live campaign).
  //    ≥2 ⇒ a comparison exists. A COUNT, not the full loader — no result JSON
  //    is read here.
  const count = await db.assessmentSubmission.count({
    where: {
      respondentId: { in: cappedMatchedIds },
      submittedAt: { not: null },
      campaign: { templateId, deletedAt: null },
    },
  });

  return count >= MIN_COMPARABLE_SUBMISSIONS;
}

// ────────────────────────────────────────────────────────────────────────
// asLongitudinalEligibilityDb — bridge the real Prisma client to the narrow
// type (the narrow interface is for test stubbing; app code passes a superset).
// ────────────────────────────────────────────────────────────────────────

export function asLongitudinalEligibilityDb(
  prisma: unknown,
): LongitudinalEligibilityDb {
  return prisma as LongitudinalEligibilityDb;
}
