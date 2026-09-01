import {
  invitedWelcomeConfigSchema,
  type InvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

/**
 * Returns normalized persisted Welcome copy for a Public Campaign, or null
 * when the stored value is absent or malformed.
 */
export function resolvePublicWelcomeConfig(
  stored: unknown,
): InvitedWelcomeConfig | null {
  const parsed = invitedWelcomeConfigSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}
