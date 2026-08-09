function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isPublicCampaignsSimpleUiEnabled(): boolean {
  if (isOn(process.env.WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_KILL)) return false;
  return isOn(process.env.WAVE_PUBLIC_CAMPAIGNS_SIMPLE_UI_ENABLED);
}
