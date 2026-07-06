/**
 * Wave V (V-3) — provenance badge for historically imported campaigns
 * (`AssessmentCampaign.importManifest != null`, Wave O Esperto imports).
 *
 * One canonical copy string, two visual variants:
 *  - "report": the su-report pill (report covers/headers, print-safe)
 *  - "admin":  the dashboard pill (campaign-detail header, token colors)
 *
 * Fail-closed by the CALLERS: they render this only when their loader's
 * `isImported` boolean is true — this component itself is unconditional.
 */
export function ImportedBadge({
  variant = "report",
}: {
  variant?: "report" | "admin";
}) {
  const className =
    variant === "report"
      ? "su-imported-badge"
      : "inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground";
  return (
    <span data-testid="imported-badge" className={className}>
      Imported from Esperto (historical)
    </span>
  );
}
