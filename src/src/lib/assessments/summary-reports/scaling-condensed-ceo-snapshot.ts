import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canViewGroupReport,
  type AccessControlDb,
} from "@/lib/assessments/access-control";
import { buildStoredRespondentReport } from "@/lib/assessments/respondent-report";
import type { ReportStyleKey } from "@/lib/assessments/report-style-registry";

import { resolveSummaryReportingState } from "./flags";
import {
  buildScalingCondensedCeoModel,
  type ScalingCondensedCeoModel,
} from "./scaling-condensed-ceo-model";

interface CampaignRow {
  id: string;
  name: string;
  accessMode: "INVITED" | "PUBLIC";
  organizationId: string | null;
  templateId: string;
  versionId: string;
  language: string;
  reportStyle: ReportStyleKey;
  importManifest: unknown;
  organization: { id: string; name: string } | null;
  template: { id: string; name: string; alias: string };
  version: {
    id: string;
    templateId: string;
    versionNumber: number;
    language: string;
    publishedAt: Date | null;
    contentHash: string;
    reportConfig: unknown;
    sections: unknown;
    questions: unknown;
    scoringConfig: unknown;
  };
  creatorCoach: {
    profileImage: string | null;
    firstName: string;
    lastName: string;
  } | null;
}

interface ParticipantRow {
  id: string;
  campaignId: string;
  respondentId: string;
  isCEO: boolean;
}

interface SubmissionRow {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  answers: unknown;
  result: unknown;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
    deletedAt: Date | null;
  } | null;
  invitation: {
    campaignId: string;
    respondentId: string;
    status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
    revokedAt: Date | null;
  } | null;
}

interface CondensedSnapshotTx extends AccessControlDb {
  assessmentCampaign: AccessControlDb["assessmentCampaign"] & {
    findFirst(args: {
      where: { id: string; deletedAt: null };
      select: Record<string, unknown>;
    }): Promise<CampaignRow | null>;
  };
  assessmentCampaignParticipant: {
    findFirst(args: {
      where: { campaignId: string; isCEO: true };
      select: Record<string, boolean>;
    }): Promise<ParticipantRow | null>;
  };
  assessmentSubmission: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }): Promise<SubmissionRow | null>;
  };
}

export interface ScalingCondensedCeoSnapshotDb {
  $transaction<T>(
    callback: (tx: CondensedSnapshotTx) => Promise<T>,
    options: { isolationLevel: "RepeatableRead" },
  ): Promise<T>;
}

export interface ScalingCondensedCeoSnapshot {
  schemaVersion: 1;
  reportType: "SCALING_CONDENSED_CEO";
  generatedAt: string;
  destination: {
    campaignId: string;
    campaignName: string;
    assessmentName: string;
    companyName: string;
    versionId: string;
    versionLabel: string;
  };
  source: {
    participantId: string;
    submissionId: string;
    respondentName: string;
    submittedAt: string;
  };
  model: ScalingCondensedCeoModel;
  provenance: {
    coachLogoUrl: string | null;
    coachName: string | null;
    peer: ScalingCondensedCeoModel["peerProvenance"];
  };
}

export type ScalingCondensedCeoResult =
  | { kind: "ok"; snapshot: ScalingCondensedCeoSnapshot }
  | { kind: "not-found" }
  | {
      kind: "not-applicable";
      reason: "public" | "unsupported-template" | "unpublished";
    }
  | {
      kind: "unavailable";
      reason: "no-ceo" | "ceo-not-submitted" | "source-incomplete";
    };

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  accessMode: true,
  organizationId: true,
  templateId: true,
  versionId: true,
  language: true,
  reportStyle: true,
  importManifest: true,
  organization: { select: { id: true, name: true } },
  template: { select: { id: true, name: true, alias: true } },
  version: {
    select: {
      id: true,
      templateId: true,
      versionNumber: true,
      language: true,
      publishedAt: true,
      contentHash: true,
      reportConfig: true,
      sections: true,
      questions: true,
      scoringConfig: true,
    },
  },
  creatorCoach: {
    select: { profileImage: true, firstName: true, lastName: true },
  },
} as const;

/** Resolves a one-click Condensed report from the current campaign CEO only. */
export async function getScalingCondensedCeoSnapshot(
  db: ScalingCondensedCeoSnapshotDb,
  actor: ApiActor,
  campaignId: string,
  generatedAt: Date,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScalingCondensedCeoResult> {
  const reporting = resolveSummaryReportingState(env, campaignId);
  if (!reporting.enabled || reporting.killed) return { kind: "not-found" };

  return db.$transaction(
    async (tx): Promise<ScalingCondensedCeoResult> => {
      if (!(await canViewGroupReport(asAccessDb(tx), actor, campaignId))) {
        return { kind: "not-found" };
      }

      const campaign = await tx.assessmentCampaign.findFirst({
        where: { id: campaignId, deletedAt: null },
        select: CAMPAIGN_SELECT,
      });
      if (!campaign || !campaign.organization) return { kind: "not-found" };
      if (campaign.accessMode !== "INVITED") {
        return { kind: "not-applicable", reason: "public" };
      }
      if (
        campaign.template.alias !== "scaling-up-full"
        || campaign.template.id !== campaign.templateId
        || campaign.version.templateId !== campaign.templateId
        || campaign.version.id !== campaign.versionId
        || campaign.version.language !== campaign.language
        || campaign.organization.id !== campaign.organizationId
      ) {
        return { kind: "not-applicable", reason: "unsupported-template" };
      }
      if (campaign.version.publishedAt === null) {
        return { kind: "not-applicable", reason: "unpublished" };
      }

      const participant = await tx.assessmentCampaignParticipant.findFirst({
        where: { campaignId, isCEO: true },
        select: { id: true, campaignId: true, respondentId: true, isCEO: true },
      });
      if (!participant) return { kind: "unavailable", reason: "no-ceo" };

      const submission = await tx.assessmentSubmission.findFirst({
        where: {
          campaignId,
          respondentId: participant.respondentId,
          invitation: {
            is: { status: "SUBMITTED", revokedAt: null },
          },
        },
        select: {
          id: true,
          campaignId: true,
          respondentId: true,
          submittedAt: true,
          answers: true,
          result: true,
          respondent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
              deletedAt: true,
            },
          },
          invitation: {
            select: {
              campaignId: true,
              respondentId: true,
              status: true,
              revokedAt: true,
            },
          },
        },
      });
      if (
        !submission
        || submission.campaignId !== campaignId
        || submission.respondentId !== participant.respondentId
        || !submission.respondent
        || submission.respondent.deletedAt !== null
        || submission.respondent.id !== participant.respondentId
        || !submission.invitation
        || submission.invitation.campaignId !== campaignId
        || submission.invitation.respondentId !== participant.respondentId
        || submission.invitation.status !== "SUBMITTED"
        || submission.invitation.revokedAt !== null
      ) {
        return { kind: "unavailable", reason: "ceo-not-submitted" };
      }

      const report = buildStoredRespondentReport({
        submission,
        respondent: submission.respondent,
        campaign: {
          name: campaign.name,
          reportStyle: campaign.reportStyle,
          organizationName: campaign.organization.name,
          template: campaign.template,
          creatorCoach: campaign.creatorCoach,
          version: campaign.version,
          importManifest: campaign.importManifest,
        },
      });
      const modeled = buildScalingCondensedCeoModel(report);
      if (modeled.kind !== "ok") {
        return { kind: "unavailable", reason: "source-incomplete" };
      }

      return {
        kind: "ok",
        snapshot: {
          schemaVersion: 1,
          reportType: "SCALING_CONDENSED_CEO",
          generatedAt: generatedAt.toISOString(),
          destination: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            assessmentName: campaign.template.name,
            companyName: campaign.organization.name,
            versionId: campaign.version.id,
            versionLabel: `Version ${campaign.version.versionNumber}`,
          },
          source: {
            participantId: participant.id,
            submissionId: submission.id,
            respondentName: modeled.model.respondentName,
            submittedAt: submission.submittedAt.toISOString(),
          },
          model: modeled.model,
          provenance: {
            coachLogoUrl: report.coachLogoUrl ?? null,
            coachName: report.coachName?.trim() || null,
            peer: modeled.model.peerProvenance,
          },
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
