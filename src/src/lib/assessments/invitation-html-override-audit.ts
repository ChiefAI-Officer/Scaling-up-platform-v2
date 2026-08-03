import {
  hasInvitationUrlToken,
  resolveInvitationHtmlMode,
  type InvitationHtmlMode,
} from "@/lib/assessments/invitation-html-policy";

export interface InvitationHtmlOverrideAuditRow {
  campaignId: string;
  templateAlias: string;
  deletedAt: Date | null;
  invitationBodyHtml: string;
}

export interface InvitationHtmlOverrideAuditEntry {
  campaignId: string;
  templateAlias: string;
  lifecycle: "live" | "soft_deleted";
  hasRecognizedUrlToken: boolean;
  currentMode: InvitationHtmlMode;
  postActivationMode: "branded_body";
  rollbackMode: "full_replace" | "branded_fallback";
}

export function buildInvitationHtmlOverrideAudit(input: {
  rows: InvitationHtmlOverrideAuditRow[];
  currentWaveDEnabled: boolean;
  currentBrandedModeEnabled: boolean;
}): {
  total: number;
  live: number;
  softDeleted: number;
  activationBlocked: boolean;
  entries: InvitationHtmlOverrideAuditEntry[];
} {
  const entries = input.rows
    .filter((row) => row.invitationBodyHtml.trim().length > 0)
    .map((row): InvitationHtmlOverrideAuditEntry => {
      const hasRecognizedUrlToken = hasInvitationUrlToken(
        row.invitationBodyHtml,
      );

      return {
        campaignId: row.campaignId,
        templateAlias: row.templateAlias,
        lifecycle: row.deletedAt === null ? "live" : "soft_deleted",
        hasRecognizedUrlToken,
        currentMode: resolveInvitationHtmlMode({
          waveDCustomHtmlEnabled: input.currentWaveDEnabled,
          brandedCustomHtmlEnabled: input.currentBrandedModeEnabled,
          rawHtml: row.invitationBodyHtml,
        }),
        postActivationMode: "branded_body",
        rollbackMode: hasRecognizedUrlToken
          ? "full_replace"
          : "branded_fallback",
      };
    });
  const live = entries.filter((entry) => entry.lifecycle === "live").length;
  const softDeleted = entries.length - live;

  return {
    total: entries.length,
    live,
    softDeleted,
    activationBlocked: live > 0,
    entries,
  };
}

export function formatInvitationHtmlOverrideAudit(
  report: ReturnType<typeof buildInvitationHtmlOverrideAudit>,
): string {
  const lines = [
    "Invitation HTML override activation audit",
    `Total: ${report.total}`,
    `Live: ${report.live}`,
    `Soft deleted: ${report.softDeleted}`,
    `Activation blocked: ${report.activationBlocked ? "yes" : "no"}`,
  ];

  for (const entry of report.entries) {
    lines.push(
      [
        `campaignId=${entry.campaignId}`,
        `templateAlias=${entry.templateAlias}`,
        `lifecycle=${entry.lifecycle}`,
        `hasRecognizedUrlToken=${entry.hasRecognizedUrlToken}`,
        `currentMode=${entry.currentMode}`,
        `postActivationMode=${entry.postActivationMode}`,
        `rollbackMode=${entry.rollbackMode}`,
      ].join(" "),
    );
  }

  return lines.join("\n");
}

export interface InvitationHtmlAuditDb {
  $transaction<T>(
    callback: (tx: InvitationHtmlAuditTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface InvitationHtmlAuditTransaction {
  $executeRawUnsafe(sql: string): Promise<unknown>;
  assessmentCampaign: {
    findMany(args: {
      where: { invitationBodyHtml: { not: null } };
      select: {
        id: true;
        deletedAt: true;
        invitationBodyHtml: true;
        template: { select: { alias: true } };
      };
      orderBy: { id: "asc" };
    }): Promise<
      Array<{
        id: string;
        deletedAt: Date | null;
        invitationBodyHtml: string | null;
        template: { alias: string };
      }>
    >;
  };
}

export async function loadInvitationHtmlOverrideRows(
  db: InvitationHtmlAuditDb,
): Promise<InvitationHtmlOverrideAuditRow[]> {
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.assessmentCampaign.findMany({
      where: { invitationBodyHtml: { not: null } },
      select: {
        id: true,
        deletedAt: true,
        invitationBodyHtml: true,
        template: { select: { alias: true } },
      },
      orderBy: { id: "asc" },
    });
  });

  return rows.map((row) => ({
    campaignId: row.id,
    templateAlias: row.template.alias,
    deletedAt: row.deletedAt,
    invitationBodyHtml: row.invitationBodyHtml ?? "",
  }));
}
