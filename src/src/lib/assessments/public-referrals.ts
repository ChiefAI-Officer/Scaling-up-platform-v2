import { Prisma } from "@prisma/client";

import {
  isPrivilegedRole,
  type ApiActor,
} from "@/lib/auth/access-control";
import { isCoachCurrentlyCertified } from "@/lib/auth/coach-status";
import { reportConfigFor } from "@/lib/assessments/report-config";
import {
  buildStoredRespondentReport,
  isScoreResult,
  type RespondentReport,
  type StoredReportVersion,
} from "@/lib/assessments/respondent-report";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";

interface PublicSubmissionFindFirst {
  findFirst: (args: {
    where: {
      id: string;
      campaign: {
        accessMode: "PUBLIC";
        deletedAt: null;
      };
    };
    select: Record<string, unknown>;
  }) => Promise<RawPublicSubmission | null>;
}

interface PublicReferralReportDb {
  $transaction: <T>(
    callback: (tx: {
      assessmentSubmission: PublicSubmissionFindFirst;
    }) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

interface CoachFindUnique {
  findUnique: (args: {
    where: { id: string };
    select: {
      id: true;
      certificationStatus: true;
      certificationExpiry: true;
    };
  }) => Promise<{
    id: string;
    certificationStatus: string;
    certificationExpiry: Date | null;
  } | null>;
}

interface PublicSubmissionFindMany {
  count: (args: {
    where: Record<string, unknown>;
  }) => Promise<number>;
  findFirst: (args: {
    where: Record<string, unknown>;
    select: {
      id: true;
      submittedAt: true;
    };
  }) => Promise<{ id: string; submittedAt: Date } | null>;
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, unknown>;
    orderBy: Array<Record<string, "desc">>;
    take: number;
  }) => Promise<RawPublicReferralListRow[]>;
}

interface PublicReferralListDb {
  $transaction: <T>(
    callback: (tx: {
      $queryRaw: <R>(query: unknown) => Promise<R>;
      coach: CoachFindUnique;
      assessmentSubmission: PublicSubmissionFindMany;
    }) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

interface RawPublicSubmission {
  id: string;
  submittedAt: Date;
  answers: unknown;
  result: unknown;
  publicTaker: unknown;
  referringCoachId: string | null;
  referringCoach: {
    id: string;
    email: string;
    certificationStatus: string;
    certificationExpiry: Date | null;
  } | null;
  campaign: {
    name: string | null;
    reportStyle: ReportStyleKey;
    importManifest?: unknown;
    template: {
      id: string;
      name: string;
      alias: string;
    };
    creatorCoach: {
      profileImage: string | null;
      firstName: string;
      lastName: string;
    } | null;
    version: StoredReportVersion & {
      publishedAt: Date | null;
    };
  };
}

export type PublicReferralReportOutcome =
  | { status: "ok"; report: RespondentReport }
  | { status: "forbidden" }
  | { status: "not-found" };

export interface PublicReferralListInput {
  query?: string;
  templateId?: string;
  cursor?: string;
  take?: number;
}

export interface PublicScoredDomain {
  key: string;
  label: string;
  score: number | null;
}

export type PublicResultSummary =
  | {
      kind: "scored";
      overallScore: number;
      tierLabel: string | null;
      domains: PublicScoredDomain[];
    }
  | { kind: "qualitative"; label: "Completed" }
  | { kind: "degraded"; label: "Result unavailable" };

export interface PublicReferralListItem {
  submissionId: string;
  submittedAt: Date;
  takerName: string;
  takerEmail: string | null;
  template: {
    id: string;
    name: string;
    alias: string;
  };
  summary: PublicResultSummary;
}

export interface PublicReferralExportRow {
  takerName: string;
  takerEmail: string;
  assessmentName: string;
  resultLabel: string;
  submittedAt: Date;
}

interface RawPublicReferralExportDataRow {
  coachEligible: true;
  isResultRow: true;
  rowOrder: number;
  takerName: string;
  takerEmail: string;
  assessmentName: string;
  templateAlias: string;
  overallScore: number | null;
  tierLabel: string | null;
  submittedAt: Date;
  totalCount: number;
}

interface RawPublicReferralExportSentinel {
  coachEligible: boolean;
  isResultRow: false;
  rowOrder: null;
  takerName: null;
  takerEmail: null;
  assessmentName: null;
  templateAlias: null;
  overallScore: null;
  tierLabel: null;
  submittedAt: null;
  totalCount: 0;
}

type RawPublicReferralExportRow =
  | RawPublicReferralExportDataRow
  | RawPublicReferralExportSentinel;

export type PublicReferralExportOutcome =
  | {
      status: "ok";
      rows: PublicReferralExportRow[];
      totalCount: number;
    }
  | { status: "forbidden" }
  | { status: "too-many"; totalCount: number; maxAllowed: number };

interface PublicReferralExportDb {
  $queryRaw: <T>(query: unknown) => Promise<T>;
}

export const MAX_PUBLIC_REFERRAL_EXPORT_ROWS = 5_000;

function publicReferralExportResultLabel(
  row: Pick<
    RawPublicReferralExportDataRow,
    "templateAlias" | "overallScore" | "tierLabel"
  >,
): string {
  const config = reportConfigFor(row.templateAlias);
  if (config.reportType === "qualitative") {
    return "Completed";
  }
  if (row.overallScore === null || !Number.isFinite(row.overallScore)) {
    return "Result unavailable";
  }

  const score = Number(row.overallScore.toFixed(2)).toString();
  const tier =
    config.showTier && row.tierLabel?.trim()
      ? row.tierLabel.trim()
      : null;
  return tier ? `${score} — ${tier}` : score;
}

/**
 * Exports only display scalars for the signed-in, currently certified Coach.
 * Eligibility, immutable ownership, filters, total count, and the 5,001-row
 * overflow sentinel are resolved by one parameterized PostgreSQL statement.
 */
export async function exportPublicReferrals(
  db: PublicReferralExportDb,
  actor: ApiActor,
  input: Pick<PublicReferralListInput, "query" | "templateId">,
): Promise<PublicReferralExportOutcome> {
  if (actor.role !== "COACH" || !actor.coachId) {
    return { status: "forbidden" };
  }

  const query = normalizeSearchQuery(input.query);
  const templateId = input.templateId?.trim() ?? "";
  const templateConstraint = templateId
    ? Prisma.sql`AND c."templateId" = ${templateId}`
    : Prisma.empty;
  const searchConstraint = query
    ? Prisma.sql`
        AND (
          LOWER(
            REGEXP_REPLACE(
              CONCAT_WS(
                ' ',
                NULLIF(BTRIM(COALESCE(s."publicTaker"->>'firstName', '')), ''),
                NULLIF(BTRIM(COALESCE(s."publicTaker"->>'lastName', '')), '')
              ),
              '[[:space:]]+',
              ' ',
              'g'
            )
          ) LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE E'\\\\'
          OR LOWER(BTRIM(COALESCE(s."publicTaker"->>'email', '')))
            LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE E'\\\\'
        )
      `
    : Prisma.empty;

  const rows = await db.$queryRaw<RawPublicReferralExportRow[]>(Prisma.sql`
    WITH eligible_coach AS (
      SELECT "id"
      FROM "coaches"
      WHERE "id" = ${actor.coachId}
        AND "certificationStatus" = 'ACTIVE'
        AND (
          "certificationExpiry" IS NULL
          OR "certificationExpiry" > CURRENT_TIMESTAMP
        )
    )
    , matched_referrals AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY s."submittedAt" DESC, s."id" DESC
      )::int AS "rowOrder",
      COALESCE(
        NULLIF(
          BTRIM(
            CONCAT_WS(
              ' ',
              NULLIF(BTRIM(COALESCE(s."publicTaker"->>'firstName', '')), ''),
              NULLIF(BTRIM(COALESCE(s."publicTaker"->>'lastName', '')), '')
            )
          ),
          ''
        ),
        BTRIM(COALESCE(s."publicTaker"->>'email', ''))
      ) AS "takerName",
      BTRIM(COALESCE(s."publicTaker"->>'email', '')) AS "takerEmail",
      t."name" AS "assessmentName",
      t."alias" AS "templateAlias",
      CASE
        WHEN JSONB_TYPEOF(s."result"->'perSection') IS DISTINCT FROM 'array'
          OR JSONB_TYPEOF(s."result"->'perQuestion') IS DISTINCT FROM 'array'
          THEN NULL
        WHEN JSONB_TYPEOF(s."result"->'scaleUpScore') = 'number'
          THEN (s."result"->>'scaleUpScore')::double precision
        WHEN JSONB_TYPEOF(s."result"->'overallAverage') = 'number'
          THEN (s."result"->>'overallAverage')::double precision
        ELSE NULL
      END AS "overallScore",
      CASE
        WHEN JSONB_TYPEOF(s."result"->'tier'->'label') = 'string'
          THEN s."result"->'tier'->>'label'
        ELSE NULL
      END AS "tierLabel",
      s."submittedAt" AS "submittedAt",
      COUNT(*) OVER()::int AS "totalCount"
    FROM "assessment_submissions" AS s
    INNER JOIN eligible_coach AS ec
      ON ec."id" = s."referringCoachId"
    INNER JOIN "assessment_campaigns" AS c
      ON c."id" = s."campaignId"
    INNER JOIN "assessment_templates" AS t
      ON t."id" = c."templateId"
    WHERE c."accessMode" = 'PUBLIC'
      AND c."deletedAt" IS NULL
      ${templateConstraint}
      ${searchConstraint}
    ORDER BY s."submittedAt" DESC, s."id" DESC
    LIMIT ${MAX_PUBLIC_REFERRAL_EXPORT_ROWS + 1}
    )
    SELECT
      TRUE AS "coachEligible",
      TRUE AS "isResultRow",
      mr."rowOrder",
      mr."takerName",
      mr."takerEmail",
      mr."assessmentName",
      mr."templateAlias",
      mr."overallScore",
      mr."tierLabel",
      mr."submittedAt",
      mr."totalCount"
    FROM matched_referrals AS mr
    UNION ALL
    SELECT
      EXISTS(SELECT 1 FROM eligible_coach) AS "coachEligible",
      FALSE AS "isResultRow",
      NULL::int AS "rowOrder",
      NULL::text AS "takerName",
      NULL::text AS "takerEmail",
      NULL::text AS "assessmentName",
      NULL::text AS "templateAlias",
      NULL::double precision AS "overallScore",
      NULL::text AS "tierLabel",
      NULL::timestamptz AS "submittedAt",
      0::int AS "totalCount"
    WHERE NOT EXISTS (SELECT 1 FROM matched_referrals)
    ORDER BY "isResultRow" DESC, "rowOrder" ASC NULLS LAST
  `);

  if (!rows[0]?.coachEligible) {
    return { status: "forbidden" };
  }
  const resultRows = rows.filter(
    (row): row is RawPublicReferralExportDataRow => row.isResultRow,
  );
  if (resultRows.length === 0) {
    return { status: "ok", rows: [], totalCount: 0 };
  }
  const totalCount = Number(resultRows[0].totalCount) || 0;
  if (totalCount > MAX_PUBLIC_REFERRAL_EXPORT_ROWS) {
    return {
      status: "too-many",
      totalCount,
      maxAllowed: MAX_PUBLIC_REFERRAL_EXPORT_ROWS,
    };
  }

  return {
    status: "ok",
    totalCount,
    rows: resultRows.map((row) => ({
      takerName: row.takerName,
      takerEmail: row.takerEmail,
      assessmentName: row.assessmentName,
      resultLabel: publicReferralExportResultLabel(row),
      submittedAt: row.submittedAt,
    })),
  };
}

export type PublicReferralListOutcome =
  | {
      status: "ok";
      items: PublicReferralListItem[];
      nextCursor: string | null;
      totalCount: number;
      ownedTotalCount: number;
    }
  | { status: "forbidden" };

interface RawPublicReferralListRow {
  id: string;
  submittedAt: Date;
  publicTaker: unknown;
  result: unknown;
  campaign: {
    template: {
      id: string;
      name: string;
      alias: string;
    };
  };
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string {
  return typeof value[key] === "string" ? value[key].trim() : "";
}

function publicTakerForReport(value: unknown): {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
} {
  const taker =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const email = stringField(taker, "email");

  return {
    firstName: stringField(taker, "firstName"),
    lastName: stringField(taker, "lastName"),
    email,
    jobTitle: stringField(taker, "jobTitle") || null,
  };
}

/**
 * Shapes display-safe list metadata from the frozen result only.
 */
export function summarizePublicResult(
  alias: string,
  result: unknown,
): PublicResultSummary {
  const reportConfig = reportConfigFor(alias);
  if (reportConfig.reportType === "qualitative") {
    return { kind: "qualitative", label: "Completed" };
  }

  if (!isScoreResult(result)) {
    return { kind: "degraded", label: "Result unavailable" };
  }

  const frozen = result as unknown as Record<string, unknown>;
  if (
    typeof frozen.overallAverage !== "number" ||
    !Number.isFinite(frozen.overallAverage) ||
    (frozen.perDomain !== undefined && !Array.isArray(frozen.perDomain))
  ) {
    return { kind: "degraded", label: "Result unavailable" };
  }

  const domains: PublicScoredDomain[] = [];
  for (const value of (frozen.perDomain ?? []) as unknown[]) {
    if (!value || typeof value !== "object") {
      return { kind: "degraded", label: "Result unavailable" };
    }
    const domain = value as Record<string, unknown>;
    const score = domain.averagePoints;
    if (
      typeof domain.key !== "string" ||
      typeof domain.label !== "string" ||
      !(
        score === null ||
        (typeof score === "number" && Number.isFinite(score))
      )
    ) {
      return { kind: "degraded", label: "Result unavailable" };
    }
    domains.push({
      key: domain.key,
      label: domain.label,
      score,
    });
  }

  const tier =
    frozen.tier && typeof frozen.tier === "object"
      ? (frozen.tier as Record<string, unknown>)
      : null;

  return {
    kind: "scored",
    overallScore: frozen.overallAverage,
    tierLabel:
      reportConfig.showTier &&
      tier &&
      typeof tier.label === "string" &&
      tier.label.trim() !== ""
        ? tier.label
        : null,
    domains,
  };
}

function normalizedTake(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 25;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function normalizeSearchQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function publicReferralSearchScope(input: {
  coachId: string;
  templateId: string;
  pattern: string;
  extraJoin?: Prisma.Sql;
  cursorBoundary?: Prisma.Sql;
}): Prisma.Sql {
  const templateConstraint = input.templateId
    ? Prisma.sql`AND c."templateId" = ${input.templateId}`
    : Prisma.empty;

  return Prisma.sql`
    FROM "assessment_submissions" AS s
    INNER JOIN "assessment_campaigns" AS c
      ON c."id" = s."campaignId"
    ${input.extraJoin ?? Prisma.empty}
    WHERE s."referringCoachId" = ${input.coachId}
      AND c."accessMode" = 'PUBLIC'
      AND c."deletedAt" IS NULL
      ${templateConstraint}
      ${input.cursorBoundary ?? Prisma.empty}
      AND (
        LOWER(
          REGEXP_REPLACE(
            CONCAT_WS(
              ' ',
              NULLIF(BTRIM(COALESCE(s."publicTaker"->>'firstName', '')), ''),
              NULLIF(BTRIM(COALESCE(s."publicTaker"->>'lastName', '')), '')
            ),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) LIKE ${input.pattern} ESCAPE E'\\\\'
        OR LOWER(
          BTRIM(COALESCE(s."publicTaker"->>'email', ''))
        ) LIKE ${input.pattern} ESCAPE E'\\\\'
      )
  `;
}

/**
 * Lists display-safe public submissions owned by the signed-in active Coach.
 */
export async function listPublicReferrals(
  db: PublicReferralListDb,
  actor: ApiActor,
  input: PublicReferralListInput,
): Promise<PublicReferralListOutcome> {
  if (actor.role !== "COACH" || !actor.coachId) {
    return { status: "forbidden" };
  }

  const coachId = actor.coachId;
  const take = normalizedTake(input.take);
  const query = normalizeSearchQuery(input.query);
  const templateId = input.templateId?.trim() ?? "";
  const cursor = input.cursor?.trim() ?? "";

  return db.$transaction(
    async (tx) => {
      const coach = await tx.coach.findUnique({
        where: { id: coachId },
        select: {
          id: true,
          certificationStatus: true,
          certificationExpiry: true,
        },
      });
      if (!isCoachCurrentlyCertified(coach)) {
        return { status: "forbidden" } as const;
      }

      const publicCampaignWhere: Record<string, unknown> = {
        accessMode: "PUBLIC",
        deletedAt: null,
      };
      const campaignWhere: Record<string, unknown> = {
        ...publicCampaignWhere,
      };
      if (templateId) {
        campaignWhere.templateId = templateId;
      }

      const where: Record<string, unknown> = {
        referringCoachId: coachId,
        campaign: campaignWhere,
      };
      const ownedWhere: Record<string, unknown> = {
        referringCoachId: coachId,
        campaign: publicCampaignWhere,
      };
      let unsearchedCursorBoundary:
        | { id: string; submittedAt: Date }
        | null
        | undefined;
      let totalCount: number;
      if (query) {
        // Prisma's PostgreSQL JSON filter has no case-insensitive mode and
        // cannot compare a concatenated first+last name. Resolve owned match
        // IDs with parameterized SQL, then re-apply every security constraint
        // in the canonical Prisma list query below.
        const cursorTemplateConstraint = templateId
          ? Prisma.sql`AND cursor_campaign."templateId" = ${templateId}`
          : Prisma.empty;
        const cursorCte = cursor
          ? Prisma.sql`
              WITH search_cursor AS (
                SELECT
                  cursor_submission."submittedAt",
                  cursor_submission."id"
                FROM "assessment_submissions" AS cursor_submission
                INNER JOIN "assessment_campaigns" AS cursor_campaign
                  ON cursor_campaign."id" = cursor_submission."campaignId"
                WHERE cursor_submission."id" = ${cursor}
                  AND cursor_submission."referringCoachId" = ${coachId}
                  AND cursor_campaign."accessMode" = 'PUBLIC'
                  AND cursor_campaign."deletedAt" IS NULL
                  ${cursorTemplateConstraint}
              )
            `
          : Prisma.empty;
        const cursorJoin = cursor
          ? Prisma.sql`CROSS JOIN search_cursor`
          : Prisma.empty;
        const cursorBoundary = cursor
          ? Prisma.sql`
              AND (
                s."submittedAt" < search_cursor."submittedAt"
                OR (
                  s."submittedAt" = search_cursor."submittedAt"
                  AND s."id" < search_cursor."id"
                )
              )
            `
          : Prisma.empty;
        const pattern = `%${escapeLikePattern(query)}%`;
        const countRows = await tx.$queryRaw<Array<{ count: number }>>(
          Prisma.sql`
            SELECT COUNT(*)::int AS "count"
            ${publicReferralSearchScope({
              coachId,
              templateId,
              pattern,
            })}
          `,
        );
        totalCount = countRows[0]?.count ?? 0;
        const matchingRows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            ${cursorCte}
            SELECT s."id"
            ${publicReferralSearchScope({
              coachId,
              templateId,
              pattern,
              extraJoin: cursorJoin,
              cursorBoundary,
            })}
            ORDER BY s."submittedAt" DESC, s."id" DESC
            LIMIT ${take + 1}
          `,
        );
        where.id = { in: matchingRows.map((row) => row.id) };
      } else {
        totalCount = await tx.assessmentSubmission.count({ where });
        if (cursor) {
          unsearchedCursorBoundary =
            await tx.assessmentSubmission.findFirst({
              where: {
                ...where,
                id: cursor,
              },
              select: { id: true, submittedAt: true },
            });
        }
      }

      const pageWhere: Record<string, unknown> = unsearchedCursorBoundary
        ? {
            ...where,
            OR: [
              {
                submittedAt: {
                  lt: unsearchedCursorBoundary.submittedAt,
                },
              },
              {
                submittedAt: unsearchedCursorBoundary.submittedAt,
                id: { lt: unsearchedCursorBoundary.id },
              },
            ],
          }
        : where;

      const rows =
        !query && cursor && !unsearchedCursorBoundary
          ? []
          : await tx.assessmentSubmission.findMany({
              where: pageWhere,
              select: {
                id: true,
                submittedAt: true,
                publicTaker: true,
                result: true,
                campaign: {
                  select: {
                    template: {
                      select: {
                        id: true,
                        name: true,
                        alias: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
              take: take + 1,
            });

      const page = rows.slice(0, take);
      const ownedTotalCount =
        query || templateId
          ? await tx.assessmentSubmission.count({ where: ownedWhere })
          : totalCount;
      const items = page.map((row): PublicReferralListItem => {
        const taker = publicTakerForReport(row.publicTaker);
        return {
          submissionId: row.id,
          submittedAt: row.submittedAt,
          takerName:
            `${taker.firstName} ${taker.lastName}`.trim() ||
            taker.email,
          takerEmail: taker.email || null,
          template: row.campaign.template,
          summary: summarizePublicResult(
            row.campaign.template.alias,
            row.result,
          ),
        };
      });

      return {
        status: "ok",
        items,
        nextCursor:
          rows.length > take && page.length > 0
            ? page[page.length - 1].id
            : null,
        totalCount,
        ownedTotalCount,
      } as const;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/**
 * Loads one frozen Results report for a public referral.
 *
 * The submission fetch and authorization decision share one transaction.
 * Coach ownership comes only from the immutable Coach ID relation; the
 * delivery email snapshot is intentionally not selected.
 */
export async function getPublicReferralReport(
  db: PublicReferralReportDb,
  actor: ApiActor,
  submissionId: string,
): Promise<PublicReferralReportOutcome> {
  return db.$transaction(
    async (tx) => {
      const submission = await tx.assessmentSubmission.findFirst({
        where: {
          id: submissionId,
          campaign: {
            accessMode: "PUBLIC",
            deletedAt: null,
          },
        },
        select: {
          id: true,
          submittedAt: true,
          answers: true,
          result: true,
          publicTaker: true,
          referringCoachId: true,
          referringCoach: {
            select: {
              id: true,
              email: true,
              certificationStatus: true,
              certificationExpiry: true,
            },
          },
          campaign: {
            select: {
              name: true,
              reportStyle: true,
              importManifest: true,
              template: {
                select: {
                  id: true,
                  name: true,
                  alias: true,
                },
              },
              creatorCoach: {
                select: {
                  profileImage: true,
                  firstName: true,
                  lastName: true,
                },
              },
              version: {
                select: {
                  id: true,
                  contentHash: true,
                  publishedAt: true,
                  sections: true,
                  questions: true,
                  scoringConfig: true,
                },
              },
            },
          },
        },
      });

      if (!submission) {
        return { status: "not-found" } as const;
      }

      if (!isPrivilegedRole(actor.role)) {
        if (
          !actor.coachId ||
          actor.coachId !== submission.referringCoachId ||
          submission.referringCoach?.id !== actor.coachId ||
          !isCoachCurrentlyCertified(submission.referringCoach)
        ) {
          return { status: "forbidden" } as const;
        }
      }

      const report = buildStoredRespondentReport({
        submission: {
          id: submission.id,
          submittedAt: submission.submittedAt,
          answers: submission.answers,
          result: submission.result,
        },
        respondent: publicTakerForReport(submission.publicTaker),
        campaign: {
          name: submission.campaign.name,
          reportStyle: submission.campaign.reportStyle,
          // Public quiz reports never carried organization metadata at submit
          // time. Keep the later authenticated view artifact-identical instead
          // of injecting the campaign's current mutable organization name.
          organizationName: "",
          template: submission.campaign.template,
          creatorCoach: submission.campaign.creatorCoach,
          version: submission.campaign.version,
          importManifest: submission.campaign.importManifest,
        },
      });
      report.referringCoachEmail =
        submission.referringCoach?.email.trim().toLowerCase() || null;

      return { status: "ok", report } as const;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
