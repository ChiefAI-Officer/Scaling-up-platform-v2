function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

/**
 * Gates the admin coach-password controls and their revised notification flow.
 * The hard kill switch always wins and all values are read at call time.
 */
export function isCoachPasswordActionsEnabled(): boolean {
  if (isOn(process.env.WAVE_COACH_PASSWORD_ACTIONS_KILL)) return false;
  return isOn(process.env.WAVE_COACH_PASSWORD_ACTIONS_ENABLED);
}
