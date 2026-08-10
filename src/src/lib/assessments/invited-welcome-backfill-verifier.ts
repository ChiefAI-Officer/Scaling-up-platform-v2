import { invitedWelcomeConfigSchema } from "@/lib/assessments/invited-welcome-config";

interface TemplateRow {
  id: string;
  alias: string;
  deletedAt: Date | null;
  invitedWelcomeDefault: unknown;
}

interface CampaignRow {
  id: string;
  accessMode: "INVITED" | "PUBLIC";
  templateAlias: string;
  invitedWelcomeSnapshot: unknown;
}

interface AliasCounts {
  templates: number;
  invitedCampaigns: number;
  publicCampaigns: number;
}

export interface InvitedWelcomeBackfillVerification {
  templatesTotal: number;
  templatesNonDeleted: number;
  templatesNull: number;
  templatesInvalid: number;
  invitedCampaignsTotal: number;
  invitedCampaignsNull: number;
  invitedCampaignsInvalid: number;
  publicCampaignsTotal: number;
  publicCampaignsWithSnapshot: number;
  byTemplateAlias: Record<string, AliasCounts>;
  ok: boolean;
}

export function verifyInvitedWelcomeBackfill(input: {
  templates: TemplateRow[];
  campaigns: CampaignRow[];
}): InvitedWelcomeBackfillVerification {
  const result: InvitedWelcomeBackfillVerification = {
    templatesTotal: input.templates.length,
    templatesNonDeleted: 0,
    templatesNull: 0,
    templatesInvalid: 0,
    invitedCampaignsTotal: 0,
    invitedCampaignsNull: 0,
    invitedCampaignsInvalid: 0,
    publicCampaignsTotal: 0,
    publicCampaignsWithSnapshot: 0,
    byTemplateAlias: {},
    ok: false,
  };

  const alias = (value: string) => {
    result.byTemplateAlias[value] ??= {
      templates: 0,
      invitedCampaigns: 0,
      publicCampaigns: 0,
    };
    return result.byTemplateAlias[value];
  };

  for (const template of input.templates) {
    if (template.deletedAt !== null) continue;
    result.templatesNonDeleted += 1;
    alias(template.alias).templates += 1;
    if (template.invitedWelcomeDefault === null) {
      result.templatesNull += 1;
    } else if (!invitedWelcomeConfigSchema.safeParse(template.invitedWelcomeDefault).success) {
      result.templatesInvalid += 1;
    }
  }

  for (const campaign of input.campaigns) {
    const counts = alias(campaign.templateAlias);
    if (campaign.accessMode === "INVITED") {
      result.invitedCampaignsTotal += 1;
      counts.invitedCampaigns += 1;
      if (campaign.invitedWelcomeSnapshot === null) {
        result.invitedCampaignsNull += 1;
      } else if (!invitedWelcomeConfigSchema.safeParse(campaign.invitedWelcomeSnapshot).success) {
        result.invitedCampaignsInvalid += 1;
      }
    } else {
      result.publicCampaignsTotal += 1;
      counts.publicCampaigns += 1;
      if (campaign.invitedWelcomeSnapshot !== null) {
        result.publicCampaignsWithSnapshot += 1;
      }
    }
  }

  result.ok =
    result.templatesNull === 0 &&
    result.templatesInvalid === 0 &&
    result.invitedCampaignsNull === 0 &&
    result.invitedCampaignsInvalid === 0 &&
    result.publicCampaignsWithSnapshot === 0;
  return result;
}
