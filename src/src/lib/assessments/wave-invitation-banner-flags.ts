export interface InvitationBannerScope {
  organizationId?: string;
  templateId?: string;
}

export interface InvitationBannerAuthoringGate {
  globallyEnabled: boolean;
  canaryIds: string[];
}

export type FilterInvitationBannerCanaryIds = (
  configuredIds: readonly string[],
) => Promise<readonly string[]>;

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryIds(): string[] {
  return [
    ...new Set(
      (process.env.WAVE_INVITATION_BANNER_CANARY ?? "")
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function isInvitationBannerEnabled(scope?: InvitationBannerScope): boolean {
  if (isOn(process.env.WAVE_INVITATION_BANNER_KILL)) return false;
  if (isOn(process.env.WAVE_INVITATION_BANNER_ENABLED)) return true;
  const allowlist = new Set(canaryIds());
  return [scope?.organizationId, scope?.templateId].some(
    (value) => typeof value === "string" && value.length > 0 && allowlist.has(value),
  );
}

export async function getInvitationBannerAuthoringGate(
  filterVisibleIds?: FilterInvitationBannerCanaryIds,
): Promise<InvitationBannerAuthoringGate> {
  if (isOn(process.env.WAVE_INVITATION_BANNER_KILL)) {
    return { globallyEnabled: false, canaryIds: [] };
  }
  if (isOn(process.env.WAVE_INVITATION_BANNER_ENABLED)) {
    return { globallyEnabled: true, canaryIds: [] };
  }

  const configuredIds = canaryIds();
  if (configuredIds.length === 0) {
    return { globallyEnabled: false, canaryIds: [] };
  }
  const visibleIds = new Set(
    filterVisibleIds ? await filterVisibleIds(configuredIds) : [],
  );
  return {
    globallyEnabled: false,
    canaryIds: configuredIds.filter((id) => visibleIds.has(id)),
  };
}
