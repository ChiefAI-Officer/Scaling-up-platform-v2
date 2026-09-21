import { createHash } from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { RateLimits } from "@/lib/rate-limit";
import { viewReport, type ReportGateDeps } from "@/lib/assessments/report-gate-core";
import { ipFromHeaders } from "@/lib/assessments/report-access-gate-deps";
import {
  getMemberGroupReport,
  getMemberRespondentReport,
} from "@/lib/assessments/member-report";
import type { RespondentReportOutcome } from "@/lib/assessments/respondent-report";
import type { GroupReportResult } from "@/lib/assessments/group-report";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { isMemberPortalEnabled } from "@/lib/members/flags";

export function memberRateLimitSubject(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

export async function viewMemberRespondentReport(
  deps: ReportGateDeps,
  args: { normalizedEmail: string; submissionId: string },
): Promise<{ outcome: RespondentReportOutcome; metricRole: "MEMBER" }> {
  const requestHeaders = await headers();
  const ip = ipFromHeaders(requestHeaders);
  const reportDb = db as unknown as Parameters<typeof getMemberRespondentReport>[0];
  const outcome = await viewReport<RespondentReportOutcome>(deps, {
    surface: "member",
    actor: null,
    noActorPolicy: "tolerate",
    auditPrincipal: args.normalizedEmail,
    flagGate: isMemberPortalEnabled,
    ip,
    userAgent: requestHeaders.get("user-agent"),
    rateLimitKey: `member-report:${memberRateLimitSubject(args.normalizedEmail)}:${args.submissionId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => getMemberRespondentReport(reportDb, args),
    classify: (value) =>
      value.status === "ok"
        ? "ok"
        : value.status === "forbidden"
          ? "forbidden"
          : "not-found",
    auditOf: (value) => {
      if (value.status !== "ok") throw new Error("unreachable member report audit");
      return {
        entityType: "AssessmentSubmission",
        entityId: value.report.provenance.submissionId,
        action: "VIEW_REPORT",
        changes: {
          kind: "member-report",
          templateAlias: value.report.templateAlias,
          reportType: reportConfigFor(value.report.templateAlias).reportType,
          versionId: value.report.provenance.versionId,
          contentHash: value.report.provenance.contentHash,
        },
      };
    },
    metricRole: "MEMBER",
  });
  return { outcome, metricRole: "MEMBER" };
}

export async function viewMemberGroupReport(
  deps: ReportGateDeps,
  args: { normalizedEmail: string; campaignId: string; generatedAt: Date },
): Promise<{ outcome: GroupReportResult; metricRole: "MEMBER" }> {
  const requestHeaders = await headers();
  const ip = ipFromHeaders(requestHeaders);
  const reportDb = db as unknown as Parameters<typeof getMemberGroupReport>[0];
  const outcome = await viewReport<GroupReportResult>(deps, {
    surface: "member",
    actor: null,
    noActorPolicy: "tolerate",
    auditPrincipal: args.normalizedEmail,
    flagGate: isMemberPortalEnabled,
    ip,
    userAgent: requestHeaders.get("user-agent"),
    rateLimitKey: `member-team-report:${memberRateLimitSubject(args.normalizedEmail)}:${args.campaignId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => getMemberGroupReport(reportDb, args),
    classify: (value) =>
      value.kind === "ok"
        ? "ok"
        : value.kind === "forbidden"
          ? "forbidden"
          : value.kind === "notEnabled"
            ? "not-found"
            : "passthrough",
    auditOf: (value) => {
      if (value.kind !== "ok") throw new Error("unreachable member team report audit");
      return {
        entityType: "AssessmentCampaign",
        entityId: args.campaignId,
        action: "GROUP_REPORT_VIEW",
        changes: {
          kind: "member-team-report",
          generatedAt: args.generatedAt.toISOString(),
          versionId: value.provenance.versionId,
          templateAlias: value.provenance.templateAlias,
          contentHash: value.provenance.contentHash,
          completedCount: value.provenance.completedCount,
          invitedCount: value.provenance.invitedCount,
          submissionIds: value.provenance.submissionIds,
        },
      };
    },
    auditFailureFields: (value) =>
      value.kind === "ok" ? { template: value.provenance.templateAlias } : {},
    metricRole: "MEMBER",
  });
  return { outcome, metricRole: "MEMBER" };
}
