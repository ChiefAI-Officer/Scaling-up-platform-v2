import {
  activePublishedWhere,
  DEFAULT_TEMPLATE_LANGUAGE,
} from "@/lib/assessments/active-version";
import {
  deriveReportStylePreviewCapabilities,
  type ReportStyleKey,
  type ReportStylePreviewCapabilities,
} from "@/lib/assessments/report-style-registry";
import { isReportStyleSelectionEnabled } from "@/lib/assessments/wave-report-styles-flags";

export interface PublicCampaignCreateOption {
  id: string;
  name: string;
  alias: string;
  defaultReportStyle: ReportStyleKey;
  reportStylesEnabled: boolean;
  reportStylePreviewCapabilities?: ReportStylePreviewCapabilities;
}

interface PublicCampaignCreateOptionRow {
  id: string;
  name: string;
  alias: string;
  defaultReportStyle: string;
  versions: Array<{ questions: unknown }>;
}

/**
 * Narrow persistence boundary for campaign-creation choices. The real Prisma
 * client satisfies this structural shape; tests can model only this query.
 */
export interface PublicCampaignCreateOptionsDb {
  assessmentTemplate: {
    findMany: (args: {
      where: {
        deletedAt: null;
        disabledAt: null;
        versions: {
          some: {
            language: typeof DEFAULT_TEMPLATE_LANGUAGE;
            publishedAt: { not: null };
            archivedAt: null;
          };
        };
      };
      orderBy: { name: "asc" };
      select: {
        id: true;
        name: true;
        alias: true;
        defaultReportStyle: true;
        versions: {
          where: {
            language: typeof DEFAULT_TEMPLATE_LANGUAGE;
            publishedAt: { not: null };
            archivedAt: null;
          };
          select: { questions: true };
          orderBy: { versionNumber: "desc" };
          take: 1;
        };
      };
    }) => Promise<PublicCampaignCreateOptionRow[]>;
  };
}

/**
 * Lists templates that a new public campaign can resolve immediately: they
 * are neither deleted nor disabled and have at least one Active version.
 */
export async function listPublicCampaignCreateOptions(
  db: PublicCampaignCreateOptionsDb,
): Promise<PublicCampaignCreateOption[]> {
  const rows = await db.assessmentTemplate.findMany({
    where: {
      deletedAt: null,
      disabledAt: null,
      versions: {
        some: {
          language: DEFAULT_TEMPLATE_LANGUAGE,
          ...activePublishedWhere,
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      alias: true,
      defaultReportStyle: true,
      versions: {
        where: {
          language: DEFAULT_TEMPLATE_LANGUAGE,
          ...activePublishedWhere,
        },
        select: { questions: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  return rows.map((row) => {
    const reportStylesEnabled = isReportStyleSelectionEnabled({ templateId: row.id });
    return {
      id: row.id,
      name: row.name,
      alias: row.alias,
      defaultReportStyle: row.defaultReportStyle as ReportStyleKey,
      reportStylesEnabled,
      ...(reportStylesEnabled
        ? {
            reportStylePreviewCapabilities: deriveReportStylePreviewCapabilities({
              templateAlias: row.alias,
              questions: row.versions[0]?.questions ?? [],
            }),
          }
        : {}),
    };
  });
}
