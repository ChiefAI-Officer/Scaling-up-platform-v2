export type ReportType = "scored" | "qualitative";

export interface ReportConfig {
  /** Which renderer drives the per-respondent report. */
  reportType: ReportType;
  /** Whether the scored renderer shows the "All sections" score/average table. */
  showScoreTable: boolean;
  /**
   * Whether to show the tier band (ADR-0015).
   *
   * Honored by BOTH the GROUP report renderer (Wave J) AND the per-respondent
   * `BrandedReport`. When false, the tier band + tier message are suppressed
   * (the ScaleUp score ring/number and all other sections still render).
   * SU Full has no tier band: Esperto shows none and we can't compute its
   * percentile, so standing is expressed as peer-deviation.
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
   * SU Full: scored report with the tier band suppressed (ADR-0015) in BOTH the
   * group renderer and the per-respondent BrandedReport — Esperto shows no tier;
   * standing is peer-deviation. The ScaleUp score + score table still render.
   */
  "scaling-up-full": { reportType: "scored", showScoreTable: true, showTier: false },
};

export function reportConfigFor(alias: string | null | undefined): ReportConfig {
  if (!alias) return DEFAULT_REPORT_CONFIG;
  return REPORT_CONFIG[alias] ?? DEFAULT_REPORT_CONFIG;
}
