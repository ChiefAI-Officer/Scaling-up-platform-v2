/**
 * Esperto-compatible Level taxonomy for OrgRespondent.roleType.
 * Six exact labels from Esperto's Add Member dropdown.
 *
 * NOTE: only `ceofounder` is a confirmed Esperto stored slug (from a live
 * member row). The 3 CEO-variant slugs (`ceofounderwithteam` /
 * `ceofounderalone`) are best-guess pending a real Esperto CSV export. If the
 * actual stored values differ, update them here — they're the single source of
 * truth for UI display, validation, and (eventually) CEO-suggestion logic.
 */
export const RESPONDENT_LEVELS = [
  { value: "teamleader",         label: "Leadership team member", isCEOFamily: false },
  { value: "employee",           label: "Employee",               isCEOFamily: false },
  { value: "guest",              label: "Guest",                  isCEOFamily: false },
  { value: "ceofounderwithteam", label: "CEO/Founder with team",  isCEOFamily: true  },
  { value: "ceofounderalone",    label: "CEO/Founder alone",      isCEOFamily: true  },
  { value: "ceofounder",         label: "CEO/Founder",            isCEOFamily: true  },
] as const;

export type RespondentLevelValue = (typeof RESPONDENT_LEVELS)[number]["value"];
export const RESPONDENT_LEVEL_VALUES = RESPONDENT_LEVELS.map((l) => l.value) as [RespondentLevelValue, ...RespondentLevelValue[]];

export function levelLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return RESPONDENT_LEVELS.find((l) => l.value === value)?.label ?? value;
}

export function isCEOFamily(value: string | null | undefined): boolean {
  if (!value) return false;
  return RESPONDENT_LEVELS.find((l) => l.value === value)?.isCEOFamily ?? false;
}
