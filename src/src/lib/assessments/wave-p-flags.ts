/**
 * Wave P — invitation-email chrome feature flag (default-OFF runtime gate).
 *
 * Jeff July-1 items #2.1 (coach logo in the invitation email header) and #2.4
 * (larger CTA button) ship behind a default-OFF global flag PLUS a canary
 * allowlist + hard kill-switch — the same three-lever dark-merge pattern used
 * by Wave O (`@/lib/assessments/wave-o-flags`), Wave N and Wave M.
 *
 * The invitation-email module itself stays pure and never reads this flag:
 * each send path evaluates it once per send (with the campaign's
 * organizationId + templateId) and passes the resulting chrome variant down.
 *
 * Truthiness matches the Wave-O / Wave-N / Wave-M convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars (all read at call time so tests can set process.env):
 * - `WAVE_P_INVITE_EMAIL_KILL` hard-overrides everything (even a matching
 *   canary or a global enable).
 * - `WAVE_P_INVITE_EMAIL_ENABLED` enables globally.
 * - `WAVE_P_INVITE_EMAIL_CANARY` enables by exact organization id OR exact
 *   template id (comma/space-separated allowlist).
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Invite-email chrome canary: matches the given organizationId OR templateId
 * against the comma/space-separated allowlist. Empty/undefined ids and an
 * empty allowlist are treated as non-matching.
 */
function canaryMatches(
  csv: string | undefined,
  organizationId: string | undefined,
  templateId: string | undefined,
): boolean {
  const allowlist = (csv ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const candidates = [organizationId, templateId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return candidates.some((value) => allowlist.includes(value));
}

/**
 * Whether the Wave-P invitation-email chrome (coach logo + larger CTA) is
 * enabled for the given organization/template.
 *
 * Pure + never-throwing: undefined opts and missing/empty env vars are treated
 * as non-matching. Default-OFF when all unset.
 */
export function isInviteEmailChromeEnabled(opts?: {
  organizationId?: string;
  templateId?: string;
}): boolean {
  // Hard kill overrides any canary or global enable.
  if (isOn(process.env.WAVE_P_INVITE_EMAIL_KILL)) return false;
  return (
    isOn(process.env.WAVE_P_INVITE_EMAIL_ENABLED) ||
    canaryMatches(
      process.env.WAVE_P_INVITE_EMAIL_CANARY,
      opts?.organizationId,
      opts?.templateId,
    )
  );
}
