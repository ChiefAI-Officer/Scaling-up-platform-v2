/**
 * The ONE production scoring seam: prune hidden answers, then score.
 * Called by BOTH submit routes and by editor Test Mode (spec 19ac C2/C5) so
 * there is no second code path. Pure (no db import). Returns the pruned
 * answers too — both submit routes persist/emit them downstream.
 *
 * pruneHiddenAnswers evaluates GENERIC showIf only (never LVA) — mirrored
 * verbatim (C1). scoreSubmission throws ScoringValidationError on config/
 * answer problems; callers handle it.
 */
import {
  scoreSubmission,
  type Answer,
  type ScoreResult,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

export function computeScoreResult(
  version: TemplateVersionForScoring,
  questions: PagerQuestion[],
  answers: Answer[],
  options?: { allowMissingRequired?: boolean },
): { result: ScoreResult; prunedAnswers: Answer[] } {
  const prunedAnswers = pruneHiddenAnswers(answers, questions);
  const result = scoreSubmission(version, prunedAnswers, options);
  return { result, prunedAnswers };
}
