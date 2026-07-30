/**
 * Assessment v7.6 — CoachLogo (Wave K; coach NAME surfaced #63/67/73/78/81).
 *
 * The creator coach's identity on the report cover + footer-left, alongside the
 * Scaling Up mark (which stays the "powered by" mark). Esperto placement.
 *   - The coach's LOGO (reuses Coach.profileImage — no schema migration) renders
 *     as an <img> when a URL is present.
 *   - The coach's NAME renders as VISIBLE text ("Coached by {name}") — previously
 *     it was only the <img alt>, so it never appeared on-screen (Jeff's report-
 *     header items). The name shows even when the coach has NO logo image.
 *
 * Graceful fallback: when there is neither a logo URL nor a name (e.g. admin
 * PUBLIC campaigns with no creator coach) this renders NOTHING, so the report
 * looks exactly as it did before (SU logo only). No broken image.
 *
 * Security (GH #229): `url` is an OPERATOR-set string with no validation at the
 * write boundary — `createCoachSchema.profileImage` is `z.string().optional()`,
 * so an admin can store any string; the coach portal's own path is upload-only
 * to Vercel Blob and cannot produce an arbitrary host. It is never interpolated
 * into raw HTML/markdown, so this is NOT an XSS concern. The concern is the
 * outbound request: Wave OSR (#71) renders this report to UNAUTHENTICATED
 * respondents, so an unvalidated src makes every respondent's browser fetch a
 * URL of the operator's choosing (IP/UA disclosure to an arbitrary host, plus
 * http: mixed content on an https page). #229's own "impact is narrow" reasoning
 * rested on the Report access gate, which #71 removes.
 *
 * So the url goes through the same https-only `safeImageSrc` gate the invitation
 * email already applies. A REJECTED url degrades to the name-only state rather
 * than rendering nothing: the byline is the half Jeff actually asked for
 * (#63/#67/#73/#78/#81), and a bad image URL must not delete it.
 *
 * `name` is React-escaped text.
 *
 * `variant` swaps the scoped CSS class (cover vs footer sizing). The logo keeps
 * `data-testid="coach-logo"`; the name carries `data-testid="coach-name"`.
 */

import { safeImageSrc } from "@/lib/assessments/safe-image-src";

export function CoachLogo({
  url,
  name,
  variant,
}: {
  url?: string | null;
  name?: string | null;
  variant: "cover" | "footer";
}) {
  const displayName = (name ?? "").trim();
  // GH #229 — an src that fails the https-only gate is treated as ABSENT, which
  // routes it into the existing name-only fallback below.
  const safeUrl = safeImageSrc(url);
  // Nothing to show when the coach has neither a renderable logo nor a name.
  if (!safeUrl && !displayName) return null;

  const wrapCls =
    variant === "cover"
      ? "su-report-coach su-report-coach-cover"
      : "su-report-coach su-report-coach-footer";
  const imgCls =
    variant === "cover"
      ? "su-report-coach-logo su-report-coach-logo-cover"
      : "su-report-coach-logo su-report-coach-logo-footer";

  return (
    <span className={wrapCls}>
      {safeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={imgCls}
          data-testid="coach-logo"
          src={safeUrl}
          // a11y: when the name is shown as adjacent visible text the logo is
          // decorative (alt="") so screen readers don't announce the name
          // twice; otherwise the name labels the logo.
          alt={displayName ? "" : "Coach logo"}
        />
      ) : null}
      {displayName ? (
        <span className="su-report-coach-name" data-testid="coach-name">
          Coached by {displayName}
        </span>
      ) : null}
    </span>
  );
}

export default CoachLogo;
