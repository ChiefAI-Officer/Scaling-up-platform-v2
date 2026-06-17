/**
 * Assessments admin dashboard stats helper.
 *
 * Extracts the three counters used by the /admin/assessments landing page
 * (wireframe 24 right pane). DB queries match the shape used by the
 * observability route so the two surfaces stay consistent.
 *
 *   activeCampaigns      — count of campaigns with status === ACTIVE
 *   templatesPublished   — count of templates that have at least one published version
 *   submissionsMTD       — count of submissions whose submittedAt falls in the current month (UTC)
 */

import { db } from "@/lib/db";

export interface AssessmentsDashboardStats {
  activeCampaigns: number;
  templatesPublished: number;
  submissionsMTD: number;
}

/**
 * First instant of the current UTC month, used as the lower bound for
 * the "submissions MTD" counter. We use UTC instead of a server-local TZ
 * because Vercel containers don't run in any deterministic timezone and
 * the operator-facing label says "Submissions MTD" without per-coach
 * regional framing.
 */
function startOfCurrentMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getAssessmentsDashboardStats(
  now: Date = new Date(),
): Promise<AssessmentsDashboardStats> {
  const monthStart = startOfCurrentMonthUtc(now);

  const [activeCampaigns, templatesPublished, submissionsMTD] =
    await Promise.all([
      // SEC-M6: exclude soft-deleted campaigns from the active count.
      db.assessmentCampaign.count({ where: { status: "ACTIVE", deletedAt: null } }),
      // Templates with at least one published version. Counting distinct
      // templates (not versions) — "Templates Published" on the card means
      // "how many templates are launchable today".
      db.assessmentTemplate.count({
        where: {
          deletedAt: null,
          versions: { some: { publishedAt: { not: null } } },
        },
      }),
      db.assessmentSubmission.count({
        where: { submittedAt: { gte: monthStart } },
      }),
    ]);

  return { activeCampaigns, templatesPublished, submissionsMTD };
}
