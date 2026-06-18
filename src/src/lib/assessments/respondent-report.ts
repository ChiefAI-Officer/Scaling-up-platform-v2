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
import {
  buildQuestionMetaByKey,
  type QuestionMeta,
} from "@/lib/assessments/question-meta";

// Re-export so existing `import { QuestionMeta } from "respondent-report"`
// consumers keep working after the shared builder extraction.
export type { QuestionMeta } from "@/lib/assessments/question-meta";

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
      alias: string;
    };
    organization: {
      name: string;
    };
    version: RawVersion;
  };
}

// ─── Public output types ──────────────────────────────────────────────────

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
  /**
   * template.alias — the stable instrument slug (e.g. "leadership-vision-alignment").
   * Optional on the shared type because the public-quiz submit path
   * (buildRespondentReportFromSubmission) constructs this shape without a
   * template-alias in hand; the authorized loader always populates it.
   */
  templateAlias?: string;
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
  /**
   * Optional: the email of the coach who referred this taker (from the ?coach=
   * query param at submission time). Used to build a mailto: CTA in report
   * emails. Absent on the admin/coach report view (where the coach is known
   * from context) and on submissions with no ?coach= param.
   */
  referringCoachEmail?: string | null;
}

export type RespondentReportOutcome =
  | { status: "ok"; report: RespondentReport }
  | { status: "forbidden" }
  | { status: "not-found" };

// ─── Guard helpers ────────────────────────────────────────────────────────

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
                alias: true,
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

    // Build questionsByKey via the SHARED builder (type+label+section+scale+
    // options, first-wins on duplicate — H10/C-M1/C-H1). questionByKey is the
    // label-only projection kept for existing consumers.
    const questionsByKey: Record<string, QuestionMeta> = buildQuestionMetaByKey(
      submission.campaign.version.questions,
    );
    const questionByKey: Record<string, string> = {};
    for (const [key, meta] of Object.entries(questionsByKey)) {
      questionByKey[key] = meta.label;
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
      templateAlias: submission.campaign.template.alias,
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
