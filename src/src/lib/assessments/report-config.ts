export type ReportType = "scored" | "qualitative";

export interface ReportConfig {
  /** Which renderer drives the per-respondent report. */
  reportType: ReportType;
  /** Whether the scored renderer shows the "All sections" score/average table. */
  showScoreTable: boolean;
  /**
   * Whether to show the tier band in the GROUP report renderer (Wave J).
   *
   * NOTE: consumed ONLY by the group renderer this wave.
   * `BrandedReport` (the per-respondent report) deliberately ignores this field —
   * per-respondent tier suppression is deferred (ADR-0015 scope).
   */
  showTier: boolean;
}

/** Default = current behaviour (back-compatible): scored report with the table and tier shown. */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  reportType: "scored",
  showScoreTable: true,
  showTier: true,
};

/**
 * Per-template report behaviour, keyed by AssessmentTemplate.alias (stable across versions).
 * See ADR-0010. Report TYPE is a global presentation policy (intentionally retroactive);
 * report CONTENT stays version-pinned. Unknown alias -> DEFAULT.
 */
const REPORT_CONFIG: Readonly<Record<string, ReportConfig>> = {
  RockHabits: { reportType: "scored", showScoreTable: false, showTier: true }, // #24
  "qsp-v1": { reportType: "qualitative", showScoreTable: false, showTier: true }, // #28
  "qsp-v2": { reportType: "qualitative", showScoreTable: false, showTier: true }, // #27
  "leadership-vision-alignment": {
    reportType: "qualitative",
    showScoreTable: false,
    showTier: true,
  }, // #30/#31
  /**
   * SU Full: scored group report with tier band suppressed in the GROUP renderer.
   * showTier:false is intentionally NOT propagated to BrandedReport (per-respondent
   * tier suppression is deferred — ADR-0015 scope).
   */
  "scaling-up-full": { reportType: "scored", showScoreTable: true, showTier: false },
};

export function reportConfigFor(alias: string | null | undefined): ReportConfig {
  if (!alias) return DEFAULT_REPORT_CONFIG;
  return REPORT_CONFIG[alias] ?? DEFAULT_REPORT_CONFIG;
}
