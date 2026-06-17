export type ReportType = "scored" | "qualitative";

export interface ReportConfig {
  /** Which renderer drives the per-respondent report. */
  reportType: ReportType;
  /** Whether the scored renderer shows the "All sections" score/average table. */
  showScoreTable: boolean;
}

/** Default = current behaviour (back-compatible): scored report with the table shown. */
export const DEFAULT_REPORT_CONFIG: ReportConfig = { reportType: "scored", showScoreTable: true };

/**
 * Per-template report behaviour, keyed by AssessmentTemplate.alias (stable across versions).
 * See ADR-0010. Report TYPE is a global presentation policy (intentionally retroactive);
 * report CONTENT stays version-pinned. Unknown alias -> DEFAULT.
 */
const REPORT_CONFIG: Readonly<Record<string, ReportConfig>> = {
  RockHabits: { reportType: "scored", showScoreTable: false }, // #24
  "qsp-v1": { reportType: "qualitative", showScoreTable: false }, // #28
  "qsp-v2": { reportType: "qualitative", showScoreTable: false }, // #27
  "leadership-vision-alignment": { reportType: "qualitative", showScoreTable: false }, // #30/#31
};

export function reportConfigFor(alias: string | null | undefined): ReportConfig {
  if (!alias) return DEFAULT_REPORT_CONFIG;
  return REPORT_CONFIG[alias] ?? DEFAULT_REPORT_CONFIG;
}
