import type { PrismaClient } from "@prisma/client";
import type { ApiActor } from "@/lib/auth/access-control";
import { isPrivilegedRole } from "@/lib/auth/access-control";
import { buildRespondentReportFromSubmission } from "@/lib/assessments/report-email";
import { isScoreResult, type RespondentReport } from "@/lib/assessments/respondent-report";
import { resolvePublicLeadsState, type PublicLeadsEnv } from "@/lib/assessments/public-leads-state";

export type PublicLeadReportOutcome =
  | {
      status: "ok";
      report: RespondentReport;
      takerEmail: string;
      ownerCoachId: string | null;
    }
  | { status: "forbidden" }
  | { status: "not-found" };

interface PublicTaker {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * Load a frozen PUBLIC submission and enforce exact stable-owner access.
 * Privileged actors may inspect Scaling Up-owned submissions; Coaches may only
 * inspect their own attribution while their account remains currently eligible.
 */
export async function getPublicLeadReport(
  client: Pick<PrismaClient, "$transaction">,
  actor: ApiActor,
  submissionId: string,
  env: PublicLeadsEnv = process.env,
): Promise<PublicLeadReportOutcome> {
  return client.$transaction(async (tx) => {
    const submission = await tx.assessmentSubmission.findFirst({
      where: {
        id: submissionId,
        respondentId: null,
        publicLeadDeletedAt: null,
        campaign: {
          deletedAt: null,
          accessMode: "PUBLIC",
        },
      },
      select: {
        id: true,
        submittedAt: true,
        answers: true,
        result: true,
        publicTaker: true,
        referringCoachId: true,
        referringCoachEmailSnapshot: true,
        campaign: {
          select: {
            name: true,
            organization: { select: { name: true } },
            template: {
              select: { name: true, alias: true },
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
        referringCoach: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            deletedAt: true,
            certificationStatus: true,
            certificationExpiry: true,
          },
        },
      },
    });

    if (!submission) return { status: "not-found" } as const;

    const state = resolvePublicLeadsState(env, {
      coachId: submission.referringCoachId,
    });
    if (!state.presentationEnabled) return { status: "not-found" } as const;

    const privileged = isPrivilegedRole(actor.role);
    if (!privileged && actor.coachId !== submission.referringCoachId) {
      return { status: "forbidden" } as const;
    }

    const owner = submission.referringCoach;
    if (!privileged) {
      const eligible =
        owner !== null &&
        owner.deletedAt === null &&
        owner.certificationStatus === "ACTIVE" &&
        (owner.certificationExpiry === null ||
          owner.certificationExpiry > new Date());
      if (!eligible) return { status: "forbidden" } as const;
    }

    const taker = (submission.publicTaker ?? {}) as PublicTaker;
    const takerEmail = (taker.email ?? "").trim();
    const result = submission.result;
    const report = buildRespondentReportFromSubmission({
      result: result as unknown as Parameters<
        typeof buildRespondentReportFromSubmission
      >[0]["result"],
      publicTaker: {
        firstName: taker.firstName ?? "",
        lastName: taker.lastName ?? "",
        email: takerEmail,
      },
      assessmentName: submission.campaign.template.name,
      templateAlias: submission.campaign.template.alias,
      campaignLabel: submission.campaign.name,
      sections: submission.campaign.version.sections,
      questions: submission.campaign.version.questions as Array<
        Record<string, unknown>
      >,
      scoringConfig: submission.campaign.version.scoringConfig,
      rawAnswers: submission.answers,
      submittedAt: submission.submittedAt,
      submissionId: submission.id,
      referringCoachEmail:
        submission.referringCoachEmailSnapshot ?? owner?.email ?? null,
      companyName: submission.campaign.organization.name,
      coachLogoUrl: owner?.profileImage ?? null,
      coachName: owner
        ? `${owner.firstName} ${owner.lastName}`.trim()
        : null,
      degraded: !isScoreResult(result),
    });
    report.provenance.versionId = submission.campaign.version.id;
    report.provenance.contentHash = submission.campaign.version.contentHash;

    return {
      status: "ok",
      report,
      takerEmail,
      ownerCoachId: submission.referringCoachId,
    } as const;
  });
}
