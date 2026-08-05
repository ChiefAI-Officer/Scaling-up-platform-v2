import type { PrismaClient } from "@prisma/client";
import { activePublishedWhere } from "./active-version";
import {
  resolveEditionStanding,
  type EditionStanding,
  type PinnedVersion,
  type SiblingVersion,
} from "./edition-standing";

export interface CampaignListEditionSource {
  id: string;
  version: PinnedVersion | null;
}

export interface CampaignListEditionFindManyArgs {
  where: {
    publishedAt: { not: null };
    archivedAt: null;
    OR: Array<{ templateId: string; language: string }>;
  };
  select: {
    templateId: true;
    versionNumber: true;
    language: true;
    publishedAt: true;
    archivedAt: true;
  };
}

export interface CampaignListEditionDb {
  assessmentTemplateVersion: {
    findMany(
      args: CampaignListEditionFindManyArgs,
    ): Promise<SiblingVersion[]>;
  };
}

export type CampaignEditionStandingMap =
  ReadonlyMap<string, EditionStanding | null>;

function pairKey(templateId: string, language: string): string {
  return JSON.stringify([templateId, language]);
}

function isResolvablePinned(
  version: PinnedVersion | null,
): version is PinnedVersion {
  return (
    version != null &&
    version.publishedAt != null &&
    Number.isFinite(version.versionNumber)
  );
}

export async function resolveCampaignListEditions(
  db: CampaignListEditionDb,
  campaigns: readonly CampaignListEditionSource[],
): Promise<CampaignEditionStandingMap> {
  const standings = new Map<string, EditionStanding | null>(
    campaigns.map((campaign) => [campaign.id, null]),
  );
  const pairs = new Map<
    string,
    { templateId: string; language: string }
  >();

  for (const campaign of campaigns) {
    if (!isResolvablePinned(campaign.version)) continue;
    const pair = {
      templateId: campaign.version.templateId,
      language: campaign.version.language,
    };
    pairs.set(pairKey(pair.templateId, pair.language), pair);
  }

  const pairList = [...pairs.values()];
  if (pairList.length === 0) return standings;

  let candidates: SiblingVersion[];
  try {
    candidates = await db.assessmentTemplateVersion.findMany({
      where: {
        ...activePublishedWhere,
        OR: pairList,
      },
      select: {
        templateId: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
        archivedAt: true,
      },
    });
  } catch (error) {
    console.error("[campaign-list-editions] lookup failed", {
      pairCount: pairList.length,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return standings;
  }

  const candidatesByPair = new Map<string, SiblingVersion[]>();
  for (const candidate of candidates) {
    const key = pairKey(candidate.templateId, candidate.language);
    const group = candidatesByPair.get(key) ?? [];
    group.push(candidate);
    candidatesByPair.set(key, group);
  }

  for (const campaign of campaigns) {
    const pinned = campaign.version;
    if (!isResolvablePinned(pinned)) continue;
    const group =
      candidatesByPair.get(pairKey(pinned.templateId, pinned.language)) ?? [];
    const activeSetContainsPinned = group.some(
      (candidate) => candidate.versionNumber === pinned.versionNumber,
    );
    if (pinned.archivedAt == null && !activeSetContainsPinned) continue;
    standings.set(
      campaign.id,
      resolveEditionStanding(pinned, group),
    );
  }

  return standings;
}

export function asCampaignListEditionDb(
  prisma: PrismaClient,
): CampaignListEditionDb {
  void prisma.assessmentTemplateVersion;
  return prisma as unknown as CampaignListEditionDb;
}
