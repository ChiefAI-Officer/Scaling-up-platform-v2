/**
 * Flag-off compatibility seam for the invited Welcome screen.
 *
 * The versioned config module now owns the legacy bytes so migration,
 * snapshots, admin authoring, and rollback all resolve from one source.
 * These exports retain the pre-feature API and object-identity behavior.
 */
import {
  GENERIC_INVITED_WELCOME_CONFIG,
  LEGACY_WELCOME_LEDE_BY_ALIAS,
  RESUME_NOTE,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

export const DEFAULT_WELCOME_LEDE =
  GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs;

export { RESUME_NOTE };

export const WELCOME_LEDE_BY_ALIAS = LEGACY_WELCOME_LEDE_BY_ALIAS;

export function resolveWelcomeLede(
  templateAlias: string | null | undefined,
): readonly string[] {
  if (
    templateAlias &&
    Object.prototype.hasOwnProperty.call(WELCOME_LEDE_BY_ALIAS, templateAlias)
  ) {
    return WELCOME_LEDE_BY_ALIAS[templateAlias];
  }
  return DEFAULT_WELCOME_LEDE;
}

export function shouldShowResumeNote(
  templateAlias: string | null | undefined,
): boolean {
  return resolveLegacyInvitedWelcomeConfig(templateAlias).finePrint === RESUME_NOTE;
}
