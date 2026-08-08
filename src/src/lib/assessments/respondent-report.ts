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
import { respondentDisplayName } from "@/lib/assessments/respondent-display-name";
import {
  buildQuestionMetaByKey,
  type QuestionMeta,
} from "@/lib/assessments/question-meta";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";
import {
  revalidateCeoReportAccessInTransaction,
  type CeoReportAccessTransaction,
} from "@/lib/assessments/ceo-report-access";
import type { CeoReportSessionPayload } from "@/lib/assessments/ceo-report-access-cookie";

// Re-export so existing `import { QuestionMeta } from "respondent-report"`
// consumers keep working after the shared builder extraction.
export type { QuestionMeta } from "@/lib/assessments/question-meta";

// ─── DB interface (narrow — accepts full PrismaClient or a tx) ────────────

interface SubmissionFindFirst {
  findFirst: (args: {
    where: {
      id?: string;
      campaignId: string;
      respondentId: string;
      [key: string]: unknown;
    };
    select: Record<string, unknown>;
  }) => Promise<RawSubmission | null>;
}

interface ReportDb {
  $transaction: <T>(
    cb: (tx: {
      assessmentSubmission: SubmissionFindFirst;
      assessmentCampaignParticipant: CeoReportAccessTransaction["assessmentCampaignParticipant"];
      assessmentInvitation: CeoReportAccessTransaction["assessmentInvitation"];
    }) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

// ─── Raw shape returned from Prisma ──────────────────────────────────────

export interface StoredReportVersion {
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
    /** Wave P (Jeff #5): display-name fallback when the roster name is blank. */
    email: string;
    jobTitle?: string | null;
  };
  campaign: {
    name: string | null;
    reportStyle: ReportStyleKey;
    /** Wave V (V-3): Wave O import-round manifest; non-null ⇒ historical import. */
    importManifest?: unknown;
    template: {
      id: string;
      name: string;
      alias: string;
    };
    organization: {
      name: string;
    };
    // Wave K: the creator coach's logo (Coach.profileImage) + name for the
    // <img alt>. Null on admin PUBLIC campaigns (createdByCoachId null) — the
    // report renders SU-logo-only in that case (graceful fallback).
    creatorCoach: {
      profileImage: string | null;
      firstName: string;
      lastName: string;
    } | null;
    version: StoredReportVersion;
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
  /** Public/invited taker email. Null only for legacy records with no email. */
  respondentEmail: string | null;
  jobTitle: string | null;
  /** campaign.organization.name */
  companyName: string;
  /** template.name — the instrument title (e.g. "Rockefeller Habits Checklist") */
  assessmentName: string;
  /**
   * template.alias — the stable instrument slug (e.g. "leadership-vision-alignment").
   *
   * REQUIRED, and deliberately so. Every renderer dispatches on it via
   * `reportConfigFor(report.templateAlias)` — report type (scored vs
   * qualitative), tier display, score table, coach CTA — so a construction site
   * that forgets it silently renders the DEFAULT config instead of the
   * instrument's own, with no error anywhere. `public-quiz-client.tsx` did
   * exactly that, and keeping this field optional is what made the omission
   * invisible to the compiler.
   *
   * Pass "" only when there is genuinely no alias in hand — `reportConfigFor`
   * and `buildQualitativeModel` both treat "" the same as absent.
   */
  templateAlias: string;
  /** Frozen campaign presentation snapshot; never derived from template policy. */
  reportStyle: ReportStyleKey;
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
  /**
   * Wave K — the creator coach's logo URL (Coach.profileImage), shown on the
   * report cover + footer-left alongside the Scaling Up mark. Null when there
   * is no creator coach or the coach has no profileImage (admin PUBLIC
   * campaigns) → the report renders exactly as before (SU logo only).
   */
  coachLogoUrl?: string | null;
  /** Wave K — the coach's display name, used as the logo `<img alt>`. */
  coachName?: string | null;
  /**
   * Wave V (V-3) — true when the campaign is a Wave O historical Esperto
   * import (`campaign.importManifest != null`). Boolean ONLY: the manifest
   * payload never reaches this model. Optional because the public-quiz path
   * constructs this shape without a campaign in hand (never imported) —
   * absent ⇒ no badge (fail-closed).
   */
  isImported?: boolean;
}

export type RespondentReportOutcome =
  | {
      status: "ok";
      report: RespondentReport;
      /** Exact server-owned availability for this frozen campaign snapshot. */
      reportStylesAvailable: boolean;
    }
  | { status: "forbidden" }
  | { status: "not-found" };

export interface StoredRespondentReportInput {
  submission: {
    id: string;
    submittedAt: Date;
    answers: unknown;
    result: unknown;
  };
  respondent: {
    firstName: string;
    lastName: string;
    email: string;
    jobTitle?: string | null;
  };
  campaign: {
    name: string | null;
    reportStyle: ReportStyleKey;
    organizationName: string;
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
    version: StoredReportVersion;
    importManifest?: unknown;
  };
}

// ─── Guard helpers ────────────────────────────────────────────────────────

export function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.perSection) && Array.isArray(v.perQuestion);
}

/**
 * Builds the canonical Results report model from a frozen stored submission.
 *
 * This function is deliberately pure: callers provide the submission's frozen
 * result/answers and its pinned published Template Version. It never scores or
 * loads mutable template content.
 */
export function buildStoredRespondentReport(
  input: StoredRespondentReportInput,
): RespondentReport {
  const questionsByKey: Record<string, QuestionMeta> = buildQuestionMetaByKey(
    input.campaign.version.questions,
  );
  const questionByKey: Record<string, string> = {};
  for (const [key, meta] of Object.entries(questionsByKey)) {
    questionByKey[key] = meta.label;
  }

  const creatorCoach = input.campaign.creatorCoach;

  return {
    respondentName: respondentDisplayName(
      input.respondent.firstName,
      input.respondent.lastName,
      input.respondent.email,
    ),
    respondentEmail: input.respondent.email?.trim() || null,
    jobTitle: input.respondent.jobTitle ?? null,
    companyName: input.campaign.organizationName,
    assessmentName: input.campaign.template.name,
    templateAlias: input.campaign.template.alias,
    reportStyle: input.campaign.reportStyle,
    campaignLabel:
      input.campaign.name && input.campaign.name.trim() !== ""
        ? input.campaign.name
        : null,
    submittedAt: input.submission.submittedAt,
    result: input.submission.result as ScoreResult,
    sections: input.campaign.version.sections,
    questionByKey,
    questionsByKey,
    rawAnswers: input.submission.answers,
    scoringConfig: input.campaign.version.scoringConfig,
    provenance: {
      submissionId: input.submission.id,
      versionId: input.campaign.version.id,
      contentHash: input.campaign.version.contentHash,
      templateName: input.campaign.template.name,
    },
    degraded: !isScoreResult(input.submission.result),
    coachLogoUrl: creatorCoach?.profileImage ?? null,
    coachName: creatorCoach
      ? `${creatorCoach.firstName} ${creatorCoach.lastName}`
      : null,
    isImported: input.campaign.importManifest != null,
  };
}

/** The shared row-to-report body; authorization always happens before this seam. */
function reportOutcomeFromStoredSubmission(
  submission: RawSubmission,
  campaignId: string,
): RespondentReportOutcome {
  return {
    status: "ok",
    report: buildStoredRespondentReport({
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        answers: submission.answers,
        result: submission.result,
      },
      respondent: submission.respondent,
      campaign: {
        name: submission.campaign.name,
        reportStyle: submission.campaign.reportStyle,
        organizationName: submission.campaign.organization.name,
        template: submission.campaign.template,
        creatorCoach: submission.campaign.creatorCoach,
        version: submission.campaign.version,
        importManifest: submission.campaign.importManifest,
      },
    }),
    reportStylesAvailable: isReportStylesEnabled({
      templateId: submission.campaign.template.id,
      campaignId,
    }),
  };
}

const respondentReportSelect = {
  id: true,
  submittedAt: true,
  answers: true,
  result: true,
  respondent: { select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true } },
  campaign: {
    select: {
      name: true,
      reportStyle: true,
      importManifest: true,
      template: { select: { id: true, name: true, alias: true } },
      organization: { select: { name: true } },
      creatorCoach: { select: { profileImage: true, firstName: true, lastName: true } },
      version: { select: { id: true, contentHash: true, sections: true, questions: true, scoringConfig: true } },
    },
  },
} as const;

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
      select: respondentReportSelect,
    });

    if (!submission || !submission.campaign.organization) {
      return { status: "not-found" } as const;
    }

    return reportOutcomeFromStoredSubmission(submission, campaignId);
  },
  // V-4 (Wave V): explicit budget over Prisma's 5s interactive-transaction
  // default — a Neon cold start / high-latency client can P2028 a report
  // view (read-path analog of the #117 commit-path fix). Tactical: the
  // transaction itself is load-bearing (auth + fetch in one snapshot, H14).
  { maxWait: 10_000, timeout: 15_000 });
}

/**
 * Self-only report path. Its sealed session is revalidated against live rows in
 * this exact transaction before the frozen report can be fetched.
 */
export async function getCeoSelfRespondentReport(
  db: ReportDb,
  session: CeoReportSessionPayload,
): Promise<RespondentReportOutcome> {
  return db.$transaction(async (tx) => {
    const expiresAt = new Date(session.expiresAt).getTime() / 1000;
    const authorized = await revalidateCeoReportAccessInTransaction(tx, {
      version: 1,
      purpose: "assessment-report-comparison-self",
      focusCampaignId: session.focusCampaignId,
      invitationId: session.invitationId,
      respondentId: session.respondentId,
      expiresAt,
    });
    if (!authorized || authorized.focusSubmissionId !== session.focusSubmissionId) {
      return { status: "forbidden" };
    }
    const submission = await tx.assessmentSubmission.findFirst({
      where: {
        id: authorized.focusSubmissionId,
        campaignId: authorized.focusCampaignId,
        respondentId: authorized.respondentId,
        invitationId: session.invitationId,
        invitation: {
          is: {
            id: session.invitationId,
            campaignId: authorized.focusCampaignId,
            respondentId: authorized.respondentId,
            status: "SUBMITTED",
            revokedAt: null,
          },
        },
        respondent: {
          is: {
            id: authorized.respondentId,
            deletedAt: null,
          },
        },
        campaign: {
          is: {
            id: authorized.focusCampaignId,
            deletedAt: null,
            accessMode: "INVITED",
            template: { is: { alias: "scaling-up-full" } },
            organization: {
              is: {
                deletedAt: null,
                respondents: {
                  some: { id: authorized.respondentId, deletedAt: null },
                },
              },
            },
            participants: {
              some: { respondentId: authorized.respondentId, isCEO: true },
            },
            OR: [
              { showResultsOnScreen: true },
              { sendResultsToRespondent: true },
            ],
          },
        },
      },
      select: respondentReportSelect,
    });
    return submission
      ? reportOutcomeFromStoredSubmission(submission, authorized.focusCampaignId)
      : { status: "not-found" };
  }, { maxWait: 10_000, timeout: 15_000 });
}
