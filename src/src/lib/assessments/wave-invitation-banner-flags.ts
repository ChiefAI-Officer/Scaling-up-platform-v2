export interface InvitationBannerScope {
  organizationId?: string;
  templateId?: string;
}

export interface InvitationBannerAuthoringGate {
  globallyEnabled: boolean;
  canaryIds: string[];
}

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
  canAccessCanaryId: (id: string) => Promise<boolean>,
): Promise<InvitationBannerAuthoringGate> {
  if (isOn(process.env.WAVE_INVITATION_BANNER_KILL)) {
    return { globallyEnabled: false, canaryIds: [] };
  }
  if (isOn(process.env.WAVE_INVITATION_BANNER_ENABLED)) {
    return { globallyEnabled: true, canaryIds: [] };
  }

  const visibleCanaryIds: string[] = [];
  for (const id of canaryIds()) {
    if (await canAccessCanaryId(id)) visibleCanaryIds.push(id);
  }
  return {
    globallyEnabled: false,
    canaryIds: visibleCanaryIds,
  };
}
