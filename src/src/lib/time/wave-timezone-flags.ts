function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function timezonePickerEnabled(): boolean {
  if (isOn(process.env.WAVE_TZ_ZONE_PICKER_KILL)) return false;
  return isOn(process.env.WAVE_TZ_ZONE_PICKER_ENABLED);
}
