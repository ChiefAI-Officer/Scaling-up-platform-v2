function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isAdminOwnedAssessmentPresentationEnabled(): boolean {
  if (isOn(process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL)) return false;
  return isOn(process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED);
}
