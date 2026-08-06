import { db } from "@/lib/db";
import type { ReportComparisonViewer } from "@/lib/assessments/report-comparison";
import { REPORT_COMPARISON_ALIAS, isReportComparisonEnabled } from "@/lib/assessments/wave-report-comparison-flags";
import {
  getCeoReportAccessSession,
  type CeoReportSessionPayload,
} from "@/lib/assessments/ceo-report-access-cookie";
import type { CeoReportAccessClaims } from "@/lib/assessments/ceo-report-access-token";

interface LiveInvitation {
  id: string;
  campaignId: string;
  respondentId: string;
  status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
  revokedAt: Date | null;
  submission: {
    id: string;
    campaignId: string;
    respondentId: string | null;
    invitationId: string | null;
    submittedAt: Date;
  } | null;
  campaign: {
    id: string;
    organizationId: string;
    templateId: string;
    deletedAt: Date | null;
    accessMode: "INVITED" | "PUBLIC";
    showResultsOnScreen: boolean;
    sendResultsToRespondent: boolean;
    template: { alias: string };
    organization: { id: string; deletedAt: Date | null };
  };
  respondent: { id: string; organizationId: string; deletedAt: Date | null };
}

interface CeoAccessDb {
  $transaction: <T>(callback: (tx: CeoReportAccessTransaction) => Promise<T>) => Promise<T>;
}

export interface CeoReportAccessTransaction {
  assessmentInvitation: {
    findFirst: (args: Record<string, unknown>) => Promise<LiveInvitation | null>;
  };
  assessmentCampaignParticipant: {
    findFirst: (args: Record<string, unknown>) => Promise<{
      campaignId: string;
      respondentId: string;
      isCEO: boolean;
    } | null>;
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCurrentClaim(claims: CeoReportAccessClaims): boolean {
  return (
    claims.version === 1 &&
    claims.purpose === "assessment-report-comparison-self" &&
    isNonEmptyString(claims.focusCampaignId) &&
    isNonEmptyString(claims.invitationId) &&
    isNonEmptyString(claims.respondentId) &&
    Number.isFinite(claims.expiresAt) &&
    claims.expiresAt > Math.floor(Date.now() / 1000)
  );
}

function isValidSessionPayload(payload: unknown): payload is CeoReportSessionPayload {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  if (
    !isNonEmptyString(value.focusCampaignId) ||
    !isNonEmptyString(value.focusSubmissionId) ||
    !isNonEmptyString(value.invitationId) ||
    !isNonEmptyString(value.respondentId) ||
    !isNonEmptyString(value.expiresAt)
  ) return false;
  const expiresAt = new Date(value.expiresAt);
  return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
}

/**
 * Re-resolves a token grant against current campaign lifecycle records. The
 * transaction is intentional: no focused report can be built from a stale
 * invitation/CEO designation snapshot.
 */
export async function revalidateCeoReportAccessInTransaction(
  tx: CeoReportAccessTransaction,
  claims: CeoReportAccessClaims,
): Promise<CeoReportSessionPayload | null> {
  if (!isCurrentClaim(claims)) return null;

  try {
      const invitation = await tx.assessmentInvitation.findFirst({
        where: {
          id: claims.invitationId,
          campaignId: claims.focusCampaignId,
          respondentId: claims.respondentId,
          status: "SUBMITTED",
          revokedAt: null,
        },
        include: {
          submission: true,
          campaign: { include: { template: true, organization: true } },
          respondent: true,
        },
      });
      if (!invitation) return null;

      const participant = await tx.assessmentCampaignParticipant.findFirst({
        where: {
          campaignId: claims.focusCampaignId,
          respondentId: claims.respondentId,
        },
      });
      const submission = invitation.submission;
      if (
        !participant ||
        participant.isCEO !== true ||
        participant.campaignId !== claims.focusCampaignId ||
        participant.respondentId !== claims.respondentId ||
        invitation.id !== claims.invitationId ||
        invitation.status !== "SUBMITTED" ||
        invitation.revokedAt !== null ||
        invitation.campaignId !== claims.focusCampaignId ||
        invitation.respondentId !== claims.respondentId ||
        invitation.campaign.id !== claims.focusCampaignId ||
        invitation.campaign.deletedAt !== null ||
        invitation.campaign.organization.id !== invitation.campaign.organizationId ||
        invitation.campaign.organization.deletedAt !== null ||
        invitation.campaign.accessMode !== "INVITED" ||
        invitation.campaign.template.alias !== REPORT_COMPARISON_ALIAS ||
        invitation.respondent.id !== claims.respondentId ||
        invitation.respondent.deletedAt !== null ||
        invitation.respondent.organizationId !== invitation.campaign.organizationId ||
        !(invitation.campaign.showResultsOnScreen || invitation.campaign.sendResultsToRespondent) ||
        !isReportComparisonEnabled({
          organizationId: invitation.campaign.organizationId,
          templateId: invitation.campaign.templateId,
        }) ||
        !submission ||
        submission.campaignId !== claims.focusCampaignId ||
        submission.respondentId !== claims.respondentId ||
        submission.invitationId !== claims.invitationId ||
        !(submission.submittedAt instanceof Date) ||
        !Number.isFinite(submission.submittedAt.getTime())
      ) return null;

      return {
        focusCampaignId: claims.focusCampaignId,
        focusSubmissionId: submission.id,
        invitationId: claims.invitationId,
        respondentId: claims.respondentId,
        expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
      };
  } catch {
    return null;
  }
}

export async function authorizeCeoReportAccess(
  database: CeoAccessDb,
  claims: CeoReportAccessClaims,
): Promise<CeoReportSessionPayload | null> {
  try {
    return await database.$transaction((tx) =>
      revalidateCeoReportAccessInTransaction(tx, claims),
    );
  } catch {
    return null;
  }
}

/** Reads only the path-scoped session and proves it is still a live self grant. */
export async function resolveCeoViewerFromExactPathSession(
  campaignId: string,
  respondentId: string,
): Promise<ReportComparisonViewer | null> {
  try {
    const session = await getCeoReportAccessSession(campaignId, respondentId);
    if (!isValidSessionPayload(session)) return null;
    if (session.focusCampaignId !== campaignId || session.respondentId !== respondentId) return null;
    const expiresAtSeconds = new Date(session.expiresAt).getTime() / 1000;
    const authorized = await authorizeCeoReportAccess(db as unknown as CeoAccessDb, {
      version: 1,
      purpose: "assessment-report-comparison-self",
      focusCampaignId: session.focusCampaignId,
      invitationId: session.invitationId,
      respondentId: session.respondentId,
      expiresAt: expiresAtSeconds,
    });
    if (!authorized || authorized.focusSubmissionId !== session.focusSubmissionId) return null;
    return {
      kind: "ceo-self",
      focusCampaignId: authorized.focusCampaignId,
      focusSubmissionId: authorized.focusSubmissionId,
      respondentId: authorized.respondentId,
    };
  } catch {
    return null;
  }
}
