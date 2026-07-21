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
 * Security: `url` is a coach/admin-set URL rendered ONLY as an <img src> (safe;
 * no XSS via img src). `name` is React-escaped text. Neither is interpolated
 * into raw HTML/markdown.
 *
 * `variant` swaps the scoped CSS class (cover vs footer sizing). The logo keeps
 * `data-testid="coach-logo"`; the name carries `data-testid="coach-name"`.
 */

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
  // Nothing to show when the coach has neither a logo nor a name.
  if (!url && !displayName) return null;

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
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={imgCls}
          data-testid="coach-logo"
          src={url}
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
