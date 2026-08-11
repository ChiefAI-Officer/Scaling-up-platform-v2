import "server-only";

import type { Prisma } from "@prisma/client";
import {
  isPrivilegedRole,
  type ApiActor,
} from "@/lib/auth/access-control";

export type CampaignPickerTemplateScopeDb = Pick<
  Prisma.TransactionClient,
  "accessGroupCoach" | "accessGroupTemplate"
>;

const liveTemplateWhere: Prisma.AssessmentTemplateWhereInput = {
  deletedAt: null,
  disabledAt: null,
};

function inaccessibleTemplateWhere(): Prisma.AssessmentTemplateWhereInput {
  return {
    id: { in: [] },
    ...liveTemplateWhere,
  };
}

export async function campaignPickerTemplateWhere(
  db: CampaignPickerTemplateScopeDb,
  actor: ApiActor,
): Promise<Prisma.AssessmentTemplateWhereInput> {
  if (isPrivilegedRole(actor.role)) {
    return liveTemplateWhere;
  }

  if (!actor.coachId) {
    return inaccessibleTemplateWhere();
  }

  const groupRows = await db.accessGroupCoach.findMany({
    where: { coachId: actor.coachId },
    include: { accessGroup: { select: { id: true, deletedAt: true } } },
  });
  const activeGroupIds = groupRows
    .filter((row) => row.accessGroup.deletedAt === null)
    .map((row) => row.accessGroupId);

  if (activeGroupIds.length === 0) {
    return inaccessibleTemplateWhere();
  }

  const grantRows = await db.accessGroupTemplate.findMany({
    where: { accessGroupId: { in: activeGroupIds } },
    select: { templateId: true, accessGroupId: true },
  });

  const grantCount = new Map<string, Set<string>>();
  for (const row of grantRows) {
    if (!grantCount.has(row.templateId)) {
      grantCount.set(row.templateId, new Set<string>());
    }
    grantCount.get(row.templateId)!.add(row.accessGroupId);
  }

  const accessibleTemplateIds: string[] = [];
  for (const [templateId, groups] of grantCount) {
    if (groups.size === activeGroupIds.length) {
      accessibleTemplateIds.push(templateId);
    }
  }

  if (accessibleTemplateIds.length === 0) {
    return inaccessibleTemplateWhere();
  }

  return {
    id: { in: accessibleTemplateIds },
    ...liveTemplateWhere,
  };
}
