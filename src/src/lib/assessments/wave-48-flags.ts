function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isQspStoryGroupEnabled(): boolean {
  if (isOn(process.env.WAVE_48_QSP_STORY_GROUP_KILL)) return false;
  return isOn(process.env.WAVE_48_QSP_STORY_GROUP_ENABLED);
}
