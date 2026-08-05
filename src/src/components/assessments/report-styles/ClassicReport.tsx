import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import type { ReactNode } from "react";

/**
 * Reserved Classic view-model adapter. It intentionally has no implementation:
 * emergency Classic rendering remains the captured LegacyClassicReport until a
 * separate DOM-equivalence proof establishes byte-compatible output.
 */
export type ClassicReportViewModelAdapter = (view: ScoredReportViewModel) => ReactNode;
