import { Prisma, type PrismaClient } from "@prisma/client";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canViewGroupReport,
  type AccessControlDb,
} from "@/lib/assessments/access-control";

const REPORT_LIST_SELECT = Prisma.validator<Prisma.SummaryReportSelect>()({
  id: true,
  campaignId: true,
  reportType: true,
  name: true,
  createdByEmailSnapshot: true,
  createdAt: true,
});

const ARTIFACT_SELECT = Prisma.validator<Prisma.SummaryReportSelect>()({
  id: true,
  campaignId: true,
  reportType: true,
  name: true,
  createdAt: true,
  inputHash: true,
  artifactPath: true,
  artifactSha256: true,
  artifactSizeBytes: true,
});

type SummaryReportListRow = Prisma.SummaryReportGetPayload<{
  select: typeof REPORT_LIST_SELECT;
}>;

export type SummaryReportArtifactMetadata = Prisma.SummaryReportGetPayload<{
  select: typeof ARTIFACT_SELECT;
}>;

export interface SummaryReportListItem {
  id: string;
  campaignId: string;
  reportType: SummaryReportListRow["reportType"];
  name: string;
  createdByEmailSnapshot: string;
  createdAt: string;
}

export type SummaryReportArtifactAuditAction =
  "SUMMARY_REPORT_VIEW" | "SUMMARY_REPORT_DOWNLOAD";

export interface SummaryReportReadDb {
  accessDb: AccessControlDb;
  findReports(campaignId: string): Promise<SummaryReportListRow[]>;
  findArtifact(input: {
    campaignId: string;
    reportId: string;
  }): Promise<SummaryReportArtifactMetadata | null>;
  createAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void>;
}

export function createPrismaSummaryReportReadDb(
  client: PrismaClient,
): SummaryReportReadDb {
  return {
    accessDb: asAccessDb(client),
    findReports(campaignId) {
      return client.summaryReport.findMany({
        where: { campaignId },
        select: REPORT_LIST_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    },
    findArtifact(input) {
      return client.summaryReport.findFirst({
        where: { id: input.reportId, campaignId: input.campaignId },
        select: ARTIFACT_SELECT,
      });
    },
    async createAudit(data) {
      await client.auditLog.create({ data });
    },
  } satisfies SummaryReportReadDb;
}

export async function listAuthorizedSummaryReports(
  db: SummaryReportReadDb,
  actor: ApiActor,
  campaignId: string,
): Promise<
  { kind: "ok"; reports: SummaryReportListItem[] } | { kind: "not-found" }
> {
  if (!(await canViewGroupReport(db.accessDb, actor, campaignId))) {
    return { kind: "not-found" };
  }

  const rows = await db.findReports(campaignId);
  const reports = rows
    .filter((row) => row.campaignId === campaignId)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      reportType: row.reportType,
      name: row.name,
      createdByEmailSnapshot: row.createdByEmailSnapshot,
      createdAt: row.createdAt.toISOString(),
    }))
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        right.id.localeCompare(left.id),
    );

  return { kind: "ok", reports };
}

export async function getAuthorizedSummaryReportArtifact(
  db: SummaryReportReadDb,
  actor: ApiActor,
  input: { campaignId: string; reportId: string },
): Promise<
  | { kind: "ok"; artifact: SummaryReportArtifactMetadata }
  | { kind: "not-found" }
> {
  if (!(await canViewGroupReport(db.accessDb, actor, input.campaignId))) {
    return { kind: "not-found" };
  }

  const artifact = await db.findArtifact(input);
  if (!artifact || artifact.campaignId !== input.campaignId) {
    return { kind: "not-found" };
  }
  return { kind: "ok", artifact };
}

export async function auditSummaryReportArtifactAccess(
  db: SummaryReportReadDb,
  actor: ApiActor,
  artifact: SummaryReportArtifactMetadata,
  action: SummaryReportArtifactAuditAction,
): Promise<void> {
  await db.createAudit({
    entityType: "SummaryReport",
    entityId: artifact.id,
    action,
    performedBy: actor.userId,
    changes: JSON.stringify({
      reportId: artifact.id,
      campaignId: artifact.campaignId,
      reportType: artifact.reportType,
      inputHash: artifact.inputHash,
      artifactSha256: artifact.artifactSha256,
    }),
  });
}
