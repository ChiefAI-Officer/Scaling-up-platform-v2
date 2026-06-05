/**
 * Assessment v7.6 — getRespondentReport
 *
 * Authorized, enriched data loader that returns everything a per-respondent
 * results report needs. Authorization check AND the submission fetch run
 * inside a SINGLE Prisma transaction (H14).
 *
 * Zero schema migrations — widened select mirrors the CSV export route pattern.
 *
 * Usage:
 *   const outcome = await getRespondentReport(db, actor, campaignId, respondentId);
 *   if (outcome.status !== "ok") { ... handle forbidden / not-found ... }
 *   const { report } = outcome;
 */

import type { ApiActor } from "@/lib/auth/access-control";
import {
  canManageCampaign,
  asAccessDb,
} from "@/lib/assessments/access-control";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ─── DB interface (narrow — accepts full PrismaClient or a tx) ────────────

interface SubmissionFindFirst {
  findFirst: (args: {
    where: { campaignId: string; respondentId: string };
    select: Record<string, unknown>;
  }) => Promise<RawSubmission | null>;
}

interface ReportDb {
  $transaction: <T>(
    cb: (tx: { assessmentSubmission: SubmissionFindFirst }) => Promise<T>,
  ) => Promise<T>;
}

// ─── Raw shape returned from Prisma ──────────────────────────────────────

interface RawVersion {
  id: string;
  contentHash: string;
  sections: unknown;
  questions: unknown;
  scoringConfig: unknown;
}

interface RawSubmission {
  id: string;
  submittedAt: Date;
  answers: unknown;
  result: unknown;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle?: string | null;
  };
  campaign: {
    name: string | null;
    template: {
      id: string;
      name: string;
    };
    organization: {
      name: string;
    };
    version: RawVersion;
  };
}

// ─── Public output types ──────────────────────────────────────────────────

export interface QuestionMeta {
  type: string;
  label: string;
  sectionStableKey?: string;
  min?: number;
  max?: number;
}

export interface ReportProvenance {
  submissionId: string;
  versionId: string;
  contentHash: string;
  templateName: string;
}

export interface RespondentReport {
  /** Display name: "firstName lastName" */
  respondentName: string;
  jobTitle: string | null;
  /** campaign.organization.name */
  companyName: string;
  /** template.name — the instrument title (e.g. "Rockefeller Habits Checklist") */
  assessmentName: string;
  /** campaign.name — the coach's label; null when absent or empty */
  campaignLabel: string | null;
  submittedAt: Date;
  /** Frozen ScoreResult from submission.result — NEVER re-scored */
  result: ScoreResult;
  /** version.sections (raw JSON array) */
  sections: unknown;
  /** stableKey → human-readable label (first-wins on duplicate) */
  questionByKey: Record<string, string>;
  /** stableKey → {type, label} (first-wins on duplicate) */
  questionsByKey: Record<string, QuestionMeta>;
  /** submission.answers (raw) */
  rawAnswers: unknown;
  /** version.scoringConfig (raw) */
  scoringConfig: unknown;
  provenance: ReportProvenance;
  /**
   * true when submission.result doesn't look like a valid ScoreResult
   * (e.g. missing perSection/perQuestion arrays). The report is still
   * returned so the caller can render a degraded view.
   */
  degraded: boolean;
}

export type RespondentReportOutcome =
  | { status: "ok"; report: RespondentReport }
  | { status: "forbidden" }
  | { status: "not-found" };

// ─── Guard helpers ────────────────────────────────────────────────────────

interface RawScale {
  min?: number;
  max?: number;
}

interface RawQuestion {
  stableKey: string;
  label: string;
  type?: string;
  sectionStableKey?: string;
  scale?: RawScale;
}

function isRawQuestion(v: unknown): v is RawQuestion {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.label === "string";
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.perSection) && Array.isArray(v.perQuestion);
}

// ─── Main loader ──────────────────────────────────────────────────────────

/**
 * Loads and returns all data needed for a per-respondent results report.
 *
 * H14: canManageCampaign + submission fetch both happen inside ONE $transaction.
 * H2/H3: ADMIN and STAFF actors bypass via canManageCampaign (which calls
 *         isPrivilegedRole at the top).
 * H4: keyed by respondentId (invited only) — no submission → not-found.
 * H9: selects submission.answers (raw) + version.questions (type + label).
 * H10: questionByKey/questionsByKey built first-wins; duplicate stableKey
 *      warns once; malformed result → degraded:true (no throw).
 */
export async function getRespondentReport(
  db: ReportDb,
  actor: ApiActor,
  campaignId: string,
  respondentId: string,
): Promise<RespondentReportOutcome> {
  return db.$transaction(async (tx) => {
    // Authorization — canManageCampaign already permits ADMIN/STAFF (H2/H3)
    const allowed = await canManageCampaign(
      asAccessDb(tx),
      actor,
      campaignId,
      "read",
    );
    if (!allowed) {
      return { status: "forbidden" } as const;
    }

    // Fetch submission keyed by (campaignId, respondentId) — H4
    const submission = await tx.assessmentSubmission.findFirst({
      where: { campaignId, respondentId },
      select: {
        id: true,
        submittedAt: true,
        answers: true,
        result: true,
        respondent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
          },
        },
        campaign: {
          select: {
            name: true,
            template: {
              select: {
                id: true,
                name: true,
              },
            },
            organization: {
              select: { name: true },
            },
            version: {
              select: {
                id: true,
                contentHash: true,
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

    // Build questionByKey / questionsByKey — first-wins on duplicate (H10)
    const rawQuestions: unknown[] = Array.isArray(
      submission.campaign.version.questions,
    )
      ? (submission.campaign.version.questions as unknown[])
      : [];

    const questionByKey: Record<string, string> = {};
    const questionsByKey: Record<string, QuestionMeta> = {};
    const seenKeys = new Set<string>();

    for (const q of rawQuestions) {
      if (!isRawQuestion(q)) continue;
      if (seenKeys.has(q.stableKey)) {
        console.warn(
          `[respondent-report] duplicate stableKey "${q.stableKey}" in version.questions — keeping first occurrence`,
        );
        continue;
      }
      seenKeys.add(q.stableKey);
      questionByKey[q.stableKey] = q.label;
      const meta: QuestionMeta = {
        type: typeof q.type === "string" ? q.type : "UNKNOWN",
        label: q.label,
      };
      if (typeof q.sectionStableKey === "string") {
        meta.sectionStableKey = q.sectionStableKey;
      }
      if (q.scale && typeof q.scale === "object") {
        if (typeof q.scale.min === "number") meta.min = q.scale.min;
        if (typeof q.scale.max === "number") meta.max = q.scale.max;
      }
      questionsByKey[q.stableKey] = meta;
    }

    // Guard the frozen result — degraded if it doesn't look like ScoreResult (H10)
    const degraded = !isScoreResult(submission.result);
    const result = submission.result as ScoreResult; // cast; caller checks degraded

    // assessmentName = instrument name (template.name); campaignLabel = coach's label
    const assessmentName = submission.campaign.template.name;
    const campaignLabel =
      submission.campaign.name && submission.campaign.name.trim() !== ""
        ? submission.campaign.name
        : null;

    const report: RespondentReport = {
      respondentName: `${submission.respondent.firstName} ${submission.respondent.lastName}`,
      jobTitle: submission.respondent.jobTitle ?? null,
      companyName: submission.campaign.organization.name,
      assessmentName,
      campaignLabel,
      submittedAt: submission.submittedAt,
      result,
      sections: submission.campaign.version.sections,
      questionByKey,
      questionsByKey,
      rawAnswers: submission.answers,
      scoringConfig: submission.campaign.version.scoringConfig,
      provenance: {
        submissionId: submission.id,
        versionId: submission.campaign.version.id,
        contentHash: submission.campaign.version.contentHash,
        templateName: submission.campaign.template.name,
      },
      degraded,
    };

    return { status: "ok", report } as const;
  });
}
