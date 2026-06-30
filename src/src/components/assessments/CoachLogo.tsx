/**
 * Assessment v7.6 — CoachLogo (Wave K).
 *
 * The creator coach's logo (reuses Coach.profileImage — no schema migration),
 * shown on the report cover + footer-left alongside the Scaling Up mark
 * (which stays the "powered by" mark). Esperto placement.
 *
 * Graceful fallback: when `url` is null/empty (no creator coach or no
 * profileImage — e.g. admin PUBLIC campaigns) this renders NOTHING, so the
 * report looks exactly as it does today (SU logo only). No broken image.
 *
 * Security: `url` is a coach/admin-set URL rendered ONLY as an <img src> (safe;
 * no XSS via img src) with an `alt`. It is never interpolated into HTML/markdown.
 *
 * `variant` only swaps the scoped CSS class (cover vs footer sizing); the markup
 * + the `data-testid="coach-logo"` are identical so render tests can target it.
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
  if (!url) return null;
  const cls =
    variant === "cover"
      ? "su-report-coach-logo su-report-coach-logo-cover"
      : "su-report-coach-logo su-report-coach-logo-footer";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      data-testid="coach-logo"
      src={url}
      alt={name ?? "Coach logo"}
    />
  );
}

export default CoachLogo;
