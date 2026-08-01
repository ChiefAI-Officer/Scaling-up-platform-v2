function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryMatches(csv: string | undefined, alias: string | undefined): boolean {
  if (!alias) return false;
  return (csv ?? "").split(/[\s,]+/).filter(Boolean).includes(alias);
}

export function isStableInvitationLinksEnabled(campaignAlias?: string): boolean {
  if (isOn(process.env.WAVE_J65_STABLE_LINKS_KILL)) return false;
  return (
    isOn(process.env.WAVE_J65_STABLE_LINKS_ENABLED) ||
    canaryMatches(process.env.WAVE_J65_STABLE_LINKS_CANARY, campaignAlias)
  );
}
