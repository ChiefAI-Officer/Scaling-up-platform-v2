/**
 * Pure ScoreResult → Test Mode view-model. Display of tier/score-table follows
 * reportConfigFor(alias) — the SAME dispatch the real reports use — so Test
 * Mode never shows a tier/table the real report hides (spec 19ac C4). Findings
 * are always surfaced as an authoring output (NOT a faithful branded-report
 * reproduction). Unanswered questions are EXCLUDED from scoring (not
 * zero-filled), so expose the count for the "tier computed over N answered"
 * honesty note.
 */
import { reportConfigFor } from "@/lib/assessments/report-config";
import type { ScoreResult } from "@/lib/assessments/scoring";

export interface TestModeDisplay {
  /** "scored" | "qualitative" — from reportConfigFor. */
  reportType: string;
  showTier: boolean;
  showScoreTable: boolean;
  result: ScoreResult;
  findings: NonNullable<ScoreResult["findings"]>;
  unansweredCount: number;
}

export function buildTestModeDisplay(
  result: ScoreResult,
  templateAlias: string | null,
): TestModeDisplay {
  const cfg = reportConfigFor(templateAlias);
  return {
    reportType: cfg.reportType,
    showTier: cfg.showTier,
    showScoreTable: cfg.showScoreTable,
    result,
    findings: result.findings ?? [],
    unansweredCount: result.unansweredKeys.length,
  };
}
