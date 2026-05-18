/**
 * Assessment v7.6 — getLongitudinalTrend() (Task H).
 *
 * Year-over-year coach-facing trend view for a (template, organization)
 * pair. Powers the `/portal/assessments/trends` page and the
 * `/api/assessment-templates/[id]/longitudinal` API route.
 *
 * Spec refs:
 *  - docs/specs/v7.6/02-service-layer-rules.md — canAccessOrganization
 *    gates the coach path; admin/staff bypass.
 *  - docs/specs/v7.6/01-schema.md — AssessmentCampaign +
 *    AssessmentSubmission shape.
 *  - public/wireframes/10-trends-page.html — Wave 1 wireframe.
 *  - v7.1 spec delta: composite line plots `submission.result.tierMetricValue`
 *    (per-template metric) NOT a blind mean of numeric answers. We expose
 *    the underlying ScoreResult numbers here (`countAchieved`,
 *    `overallTotal`, `overallAverage`) — the UI picks `meanCountAchieved`
 *    as the v1 composite because the seeded Rockefeller scoringConfig
 *    uses `tierMetric: "countAchieved"`. Future per-template chart
 *    rendering can swap to `tierMetricValue` once we expose more than
 *    one template; the dataset returned here is the same superset.
 *  - v1 single-version constraint: campaigns on older versions are
 *    excluded from the trend (would mix incompatible question sets);
 *    they're counted in `excludedCampaignCount` so the UI can show a
 *    banner.
 *
 * Design notes
 * ────────────
 *  - DB shape narrowed to the delegates this module reads so tests can
 *    stub it cleanly (mirrors aggregate-report.ts + campaign-detail.ts).
 *  - Reads `submission.result` (frozen ScoreResult) — NEVER recomputes.
 *  - Sorting: campaigns by `openAt` ASC (oldest → newest, left → right
 *    on the time-series chart). Submissions inside a campaign by
 *    `submittedAt` ASC for stable rendering.
 *  - "Latest version" = the most recent `publishedAt`. Ties broken by
 *    `versionNumber` DESC. v1 has a single published version per
 *    template (Rockefeller alias `RockHabits`, v1 enUS) — this code is
 *    written to be correct on day one with the v1.5 multi-version case.
 *  - Soft-delete: campaigns with `status === "CANCELED"` are excluded.
 *    There's no `deletedAt` column on AssessmentCampaign in v7.6
 *    schema — the type union only includes DRAFT/ACTIVE/CLOSED so a
 *    future CANCELED value remains forward-compatible without a
 *    schema change here. Filtering happens at the service layer
 *    rather than the DB so callers stubbing the DB don't have to
 *    replicate the filter.
 */

import type { ScoreResult, PerSectionResult } from "./scoring";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface TrendCampaignSubmission {
  respondentId: string | null;
  respondentName: string;
  submittedAt: Date;
  countAchieved: number;
  overallTotal: number;
  overallAverage: number;
  tierLabel: string | null;
  perSection: Array<{
    stableKey: string;
    name: string;
    totalPoints: number;
    averagePoints: number;
  }>;
}

export interface TrendCampaign {
  campaign: {
    id: string;
    name: string;
    alias: string;
    openAt: Date;
    closeAt: Date | null;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    versionNumber: number;
    language: string;
  };
  submissions: TrendCampaignSubmission[];
  meanCountAchieved: number;
  meanOverallTotal: number;
  meanOverallAverage: number;
}

export interface QuestionSparklinePoint {
  campaignId: string;
  campaignName: string;
  openAt: Date;
  mean: number;
  /** Submission count contributing to this mean. */
  n: number;
}

export interface LongitudinalTrend {
  template: { id: string; name: string; alias: string };
  organization: { id: string; name: string };
  latestVersion: { id: string; versionNumber: number; language: string };
  /** Sorted by `campaign.openAt` ascending. */
  campaigns: TrendCampaign[];
  /** stableKey → time-series of per-campaign means. */
  questionSparklines: Record<string, QuestionSparklinePoint[]>;
  /** True when more than one published version exists (v1.5+). */
  hasMultipleVersions: boolean;
  /** Number of campaigns dropped because they're on an older version. */
  excludedCampaignCount: number;
}

// ────────────────────────────────────────────────────────────────────────
// Narrow Prisma-shape DB interface — accepts the real Prisma client AND a
// transaction client. Only the delegates we actually use are listed; tests
// stub against this interface, never the full Prisma type.
// ────────────────────────────────────────────────────────────────────────

interface TemplateRow {
  id: string;
  name: string;
  alias: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  deletedAt: Date | null;
}

interface VersionRow {
  id: string;
  templateId: string;
  versionNumber: number;
  language: string;
  publishedAt: Date | null;
  questions: unknown;
}

interface CampaignRow {
  id: string;
  name: string;
  alias: string;
  openAt: Date;
  closeAt: Date | null;
  status: string;
  versionId: string;
  version: {
    id: string;
    versionNumber: number;
    language: string;
  };
}

interface SubmissionRow {
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  result: unknown;
  publicTaker: unknown;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface TrendsDb {
  assessmentTemplate: {
    findUnique: (args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => Promise<TemplateRow | null>;
  };
  organization: {
    findUnique: (args: {
      where: { id: string };
      select?: Record<string, unknown>;
    }) => Promise<OrganizationRow | null>;
  };
  assessmentTemplateVersion: {
    findMany: (args: {
      where: { templateId: string; publishedAt?: { not: null } };
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
      select?: Record<string, unknown>;
    }) => Promise<VersionRow[]>;
  };
  assessmentCampaign: {
    findMany: (args: {
      where: { templateId: string; organizationId: string };
      include?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => Promise<CampaignRow[]>;
  };
  assessmentSubmission: {
    findMany: (args: {
      where: { campaignId: { in: string[] } };
      include?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => Promise<SubmissionRow[]>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.countAchieved === "number" &&
    typeof v.overallTotal === "number" &&
    typeof v.overallAverage === "number"
  );
}

interface QuestionDef {
  stableKey: string;
  label: string;
  sortOrder: number;
}

function safeQuestionKeys(questions: unknown): QuestionDef[] {
  if (!Array.isArray(questions)) return [];
  const out: QuestionDef[] = [];
  for (const q of questions) {
    if (
      q &&
      typeof q === "object" &&
      typeof (q as { stableKey?: unknown }).stableKey === "string"
    ) {
      const row = q as {
        stableKey: string;
        label?: unknown;
        sortOrder?: unknown;
      };
      out.push({
        stableKey: row.stableKey,
        label: typeof row.label === "string" ? row.label : row.stableKey,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
      });
    }
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

function resolveRespondentName(row: SubmissionRow): string {
  if (row.respondent) {
    const first = row.respondent.firstName ?? "";
    const last = row.respondent.lastName ?? "";
    const combined = `${first} ${last}`.trim();
    if (combined.length > 0) return combined;
  }
  if (row.publicTaker && typeof row.publicTaker === "object") {
    const taker = row.publicTaker as {
      firstName?: unknown;
      lastName?: unknown;
    };
    const first = typeof taker.firstName === "string" ? taker.firstName : "";
    const last = typeof taker.lastName === "string" ? taker.lastName : "";
    const combined = `${first} ${last}`.trim();
    if (combined.length > 0) return combined;
  }
  return "Anonymous";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Choose the latest published version. Highest `publishedAt`; ties broken
 * by highest `versionNumber`. Already-published rows only.
 */
function selectLatestVersion(rows: VersionRow[]): VersionRow | null {
  let latest: VersionRow | null = null;
  for (const r of rows) {
    if (r.publishedAt === null) continue;
    if (latest === null) {
      latest = r;
      continue;
    }
    const latestTime =
      latest.publishedAt === null ? -Infinity : latest.publishedAt.getTime();
    const rTime = r.publishedAt.getTime();
    if (rTime > latestTime) {
      latest = r;
    } else if (rTime === latestTime && r.versionNumber > latest.versionNumber) {
      latest = r;
    }
  }
  return latest;
}

// ────────────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────────────

export async function getLongitudinalTrend(
  db: TrendsDb,
  templateId: string,
  organizationId: string,
): Promise<LongitudinalTrend> {
  const [template, organization, versions] = await Promise.all([
    db.assessmentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, name: true, alias: true },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, deletedAt: true },
    }),
    db.assessmentTemplateVersion.findMany({
      where: { templateId, publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { versionNumber: "desc" }],
      select: {
        id: true,
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        questions: true,
      },
    }),
  ]);

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }
  if (!organization || organization.deletedAt !== null) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const latestVersion = selectLatestVersion(versions);
  const publishedCount = versions.filter((v) => v.publishedAt !== null).length;

  // No published version → return an empty trend rather than throwing;
  // the UI renders the "no campaigns yet" empty state. Callers that need
  // the strict "template never published" signal can detect it via
  // `latestVersion === undefined` semantics — but to keep the public type
  // simple we just emit a synthetic placeholder when nothing is published.
  if (latestVersion === null) {
    return {
      template: {
        id: template.id,
        name: template.name,
        alias: template.alias,
      },
      organization: { id: organization.id, name: organization.name },
      latestVersion: { id: "", versionNumber: 0, language: "" },
      campaigns: [],
      questionSparklines: {},
      hasMultipleVersions: false,
      excludedCampaignCount: 0,
    };
  }

  const allCampaigns = await db.assessmentCampaign.findMany({
    where: { templateId, organizationId },
    include: {
      version: {
        select: { id: true, versionNumber: true, language: true },
      },
    },
    orderBy: { openAt: "asc" },
  });

  // Drop soft-deleted: today the only AssessmentCampaign status values are
  // DRAFT/ACTIVE/CLOSED. Future CANCELED rows are filtered defensively.
  const liveCampaigns = allCampaigns.filter((c) => c.status !== "CANCELED");

  const includedCampaigns = liveCampaigns.filter(
    (c) => c.version.id === latestVersion.id,
  );
  const excludedCampaignCount = liveCampaigns.length - includedCampaigns.length;
  const hasMultipleVersions = publishedCount > 1;

  if (includedCampaigns.length === 0) {
    return {
      template: {
        id: template.id,
        name: template.name,
        alias: template.alias,
      },
      organization: { id: organization.id, name: organization.name },
      latestVersion: {
        id: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        language: latestVersion.language,
      },
      campaigns: [],
      questionSparklines: {},
      hasMultipleVersions,
      excludedCampaignCount,
    };
  }

  const includedCampaignIds = includedCampaigns.map((c) => c.id);

  const submissions = await db.assessmentSubmission.findMany({
    where: { campaignId: { in: includedCampaignIds } },
    include: {
      respondent: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  // Group submissions by campaign.
  const submissionsByCampaign = new Map<string, SubmissionRow[]>();
  for (const id of includedCampaignIds) submissionsByCampaign.set(id, []);
  for (const s of submissions) {
    const list = submissionsByCampaign.get(s.campaignId);
    if (list) list.push(s);
  }

  // Build per-campaign trend rows.
  const campaignsOut: TrendCampaign[] = includedCampaigns.map((c) => {
    const rawSubs = submissionsByCampaign.get(c.id) ?? [];

    const trendSubs: TrendCampaignSubmission[] = [];
    let sumCount = 0;
    let sumTotal = 0;
    let sumAvg = 0;
    let scoredCount = 0;
    for (const s of rawSubs) {
      if (!isScoreResult(s.result)) {
        // Defensive: malformed result row → skip from numeric aggregation
        // but still surface in the submissions list with zeros so the UI
        // can flag it.
        trendSubs.push({
          respondentId: s.respondentId,
          respondentName: resolveRespondentName(s),
          submittedAt: s.submittedAt,
          countAchieved: 0,
          overallTotal: 0,
          overallAverage: 0,
          tierLabel: null,
          perSection: [],
        });
        continue;
      }
      const r = s.result;
      sumCount += r.countAchieved;
      sumTotal += r.overallTotal;
      sumAvg += r.overallAverage;
      scoredCount += 1;
      trendSubs.push({
        respondentId: s.respondentId,
        respondentName: resolveRespondentName(s),
        submittedAt: s.submittedAt,
        countAchieved: r.countAchieved,
        overallTotal: r.overallTotal,
        overallAverage: r.overallAverage,
        tierLabel: r.tier?.label ?? null,
        perSection: (r.perSection ?? []).map((p: PerSectionResult) => ({
          stableKey: p.stableKey,
          name: p.name,
          totalPoints: p.totalPoints,
          averagePoints: p.averagePoints,
        })),
      });
    }

    return {
      campaign: {
        id: c.id,
        name: c.name,
        alias: c.alias,
        openAt: c.openAt,
        closeAt: c.closeAt,
        status: c.status as "DRAFT" | "ACTIVE" | "CLOSED",
        versionNumber: c.version.versionNumber,
        language: c.version.language,
      },
      submissions: trendSubs,
      meanCountAchieved: scoredCount === 0 ? 0 : sumCount / scoredCount,
      meanOverallTotal: scoredCount === 0 ? 0 : sumTotal / scoredCount,
      meanOverallAverage: scoredCount === 0 ? 0 : sumAvg / scoredCount,
    };
  });

  // Build per-question sparklines. Anchor question set to the latest
  // version's question list; per-campaign mean of result.perQuestion[k].value.
  const questionDefs = safeQuestionKeys(latestVersion.questions);
  const questionSparklines: Record<string, QuestionSparklinePoint[]> = {};

  for (const q of questionDefs) {
    const series: QuestionSparklinePoint[] = [];
    let anyData = false;
    for (const c of includedCampaigns) {
      const rawSubs = submissionsByCampaign.get(c.id) ?? [];
      const values: number[] = [];
      for (const s of rawSubs) {
        if (!isScoreResult(s.result)) continue;
        const pq = s.result.perQuestion ?? [];
        const hit = pq.find((p) => p.stableKey === q.stableKey);
        if (hit && typeof hit.value === "number") {
          values.push(hit.value);
        }
      }
      if (values.length > 0) anyData = true;
      series.push({
        campaignId: c.id,
        campaignName: c.name,
        openAt: c.openAt,
        mean: mean(values),
        n: values.length,
      });
    }
    if (anyData) {
      questionSparklines[q.stableKey] = series;
    }
  }

  return {
    template: { id: template.id, name: template.name, alias: template.alias },
    organization: { id: organization.id, name: organization.name },
    latestVersion: {
      id: latestVersion.id,
      versionNumber: latestVersion.versionNumber,
      language: latestVersion.language,
    },
    campaigns: campaignsOut,
    questionSparklines,
    hasMultipleVersions,
    excludedCampaignCount,
  };
}

// ────────────────────────────────────────────────────────────────────────
// asTrendsDb — bridge the real Prisma client to the narrow type.
// ────────────────────────────────────────────────────────────────────────

export function asTrendsDb(prisma: unknown): TrendsDb {
  return prisma as TrendsDb;
}
