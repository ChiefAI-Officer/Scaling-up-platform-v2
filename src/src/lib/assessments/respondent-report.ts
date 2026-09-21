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
  type QuestionMeta,
} from "@/lib/assessments/question-meta";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";
import {
  revalidateCeoReportAccessInTransaction,
  type CeoReportAccessTransaction,
} from "@/lib/assessments/ceo-report-access";
import type { CeoReportSessionPayload } from "@/lib/assessments/ceo-report-access-cookie";
import type { SuFullPeerPresentation } from "@/lib/assessments/su-full-peer-presentation";
import {
  type SafeReportHtml,
} from "@/lib/assessments/report-html";
import type { ActiveVersionDb } from "@/lib/assessments/active-version";
import { projectRespondentReport } from "@/lib/assessments/respondent-report-projection";

export {
  buildStoredRespondentReport,
  isScoreResult,
} from "@/lib/assessments/respondent-report-projection";

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
      assessmentTemplateVersion: ActiveVersionDb["assessmentTemplateVersion"];
    }) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

// ─── Raw shape returned from Prisma ──────────────────────────────────────

export interface StoredReportVersion {
  id: string;
  contentHash: string;
  reportConfig: unknown;
  sections: unknown;
  questions: unknown;
  scoringConfig: unknown;
}

export interface RawSubmission {
  id: string;
  respondentId?: string | null;
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
    id?: string;
    deletedAt?: Date | null;
    name: string | null;
    language: string;
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
  /** Template Version that supplied report-only HTML/CSS presentation. */
  presentationVersionId?: string;
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
  /** Safe web-only fragments from the published presentation, with pinned fallback. */
  reportHtml?: SafeReportHtml;
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
   * True only for a PUBLIC lead result surface. Report configuration may use
   * this marker to replace generic next steps with source-owned lead actions.
   * Invited and operator-built reports omit it rather than inferring from alias.
   */
  publicLeadActions?: boolean;
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
  /** Current template-level reference data resolved for this render; not submission provenance. */
  suFullPeerPresentation?: SuFullPeerPresentation | null;
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
  /** Report-only HTML/CSS resolved by the caller from the published version. */
  reportHtml?: SafeReportHtml;
  presentationVersionId?: string;
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

export const respondentReportSelect = {
  id: true,
  respondentId: true,
  submittedAt: true,
  answers: true,
  result: true,
  respondent: { select: { id: true, firstName: true, lastName: true, email: true, jobTitle: true } },
  campaign: {
    select: {
      id: true,
      deletedAt: true,
      name: true,
      language: true,
      reportStyle: true,
      importManifest: true,
      template: { select: { id: true, name: true, alias: true } },
      organization: { select: { name: true } },
      creatorCoach: { select: { profileImage: true, firstName: true, lastName: true } },
      version: { select: { id: true, contentHash: true, reportConfig: true, sections: true, questions: true, scoringConfig: true } },
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

    return projectRespondentReport(tx, submission, campaignId);
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
      ? projectRespondentReport(tx, submission, authorized.focusCampaignId)
      : { status: "not-found" };
  }, { maxWait: 10_000, timeout: 15_000 });
}
