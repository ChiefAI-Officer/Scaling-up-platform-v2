import {
  invitedWelcomeConfigSchema,
  resolveLegacyInvitedWelcomeConfig,
  type InvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";
import { canonicalJson } from "@/lib/assessments/summary-reports/canonical";

/**
 * Returns authored Welcome copy for a Public Campaign, or null when the stored
 * value is absent, malformed, or still equal to the code-owned baseline.
 */
export function resolvePublicWelcomeConfig(
  stored: unknown,
  templateAlias: string | null | undefined,
): InvitedWelcomeConfig | null {
  const parsed = invitedWelcomeConfigSchema.safeParse(stored);
  if (!parsed.success) return null;

  const baseline = resolveLegacyInvitedWelcomeConfig(templateAlias);
  return canonicalJson(parsed.data) === canonicalJson(baseline)
    ? null
    : parsed.data;
}
