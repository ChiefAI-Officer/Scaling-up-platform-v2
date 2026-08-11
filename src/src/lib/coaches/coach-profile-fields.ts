export const DEFAULT_COACH_PROFESSIONAL_TITLE = "Scaling Up Certified Coach";

export interface CoachProfessionalTitleSource {
  title?: string | null;
  company?: string | null;
}

export function resolveCoachProfessionalTitle(
  coach: CoachProfessionalTitleSource,
): string {
  return coach.title?.trim()
    || coach.company?.trim()
    || DEFAULT_COACH_PROFESSIONAL_TITLE;
}
