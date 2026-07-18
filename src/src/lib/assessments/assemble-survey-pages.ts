/**
 * Wave ED10 (spec 19am-plan, Task 5) — the preview page-assembly helper.
 *
 * `assembleSurveyPages` COMPOSES the exact same pure functions that
 * `components/assessments/org-survey-client.tsx` composes inline — in the
 * exact same order — so the ED10 editor Preview tab (Task 6) renders a page
 * pipeline byte-identical to the real INVITED survey. Fidelity to that
 * component is the whole point of this helper.
 *
 * The composition mirrors org-survey-client.tsx VERBATIM:
 *   1. AUDIENCE POLICY (lines 221-227, 236-253) — SU-Full + non-CEO drops the
 *      CEO-only S_BACKGROUND section AND its questions at the source, then
 *      both lists are sorted by `sortOrder`.
 *   2. VISIBILITY (lines 262-270) — `filterVisibleSurveyQuestions` (the LVA
 *      alias branch + the generic authored show-if pass) against `answers`.
 *   3. ASSEMBLY (lines 480-489) —
 *        mergeCustomSlides(
 *          filterConditionallyEmptiedPages(
 *            buildSectionPages(sortedSections, visibleQuestions),
 *            sortedQuestions,           // NOTE: the full sorted list, NOT visible
 *          ),
 *          customSlides,
 *        )
 *
 * DELIBERATE DUPLICATION (task constraint): org-survey-client is NOT
 * refactored to call this helper — the two COMPOSE the same shared lib fns.
 * Those fns (`buildSectionPages`, `filterVisibleSurveyQuestions`,
 * `filterConditionallyEmptiedPages`, `mergeCustomSlides`) are the anti-drift
 * substrate — any change to survey behavior lands in them and flows to both.
 * Only the top-level ordering is duplicated; a change to org-survey-client's
 * ordering MUST be mirrored here (and in assemble-survey-pages.test.ts).
 *
 * PURE + framework-agnostic: no React, no DOM, no I/O. Callers adapt their
 * source (live editor draft OR stored Active-version JSON) to
 * `PagerSection[]` / `PagerQuestion[]` first (see preview-version-adapter.ts).
 */

import {
  buildSectionPages,
  filterConditionallyEmptiedPages,
  type PagerSection,
  type PagerQuestion,
} from "@/lib/assessments/section-pages";
import { filterVisibleSurveyQuestions } from "@/lib/assessments/form-visibility";
import {
  mergeCustomSlides,
  type SafeSlide,
  type MergeResult,
} from "@/lib/assessments/custom-slides";

/** The answers map shape used by the survey pipeline (matches org-survey-client). */
export type SurveyAnswersMap = Record<string, number | string | string[]>;

// Wave J-1 — SU-Full CEO-only background section gating. These MUST stay in
// lockstep with the identically-named constants in org-survey-client.tsx.
const SU_FULL_ALIAS = "scaling-up-full";
const SU_FULL_BACKGROUND_SECTION = "S_BACKGROUND";

export interface AssembleSurveyPagesOptions {
  /** Current answers — drives show-if visibility. Use `{}` for a static preview. */
  answers: SurveyAnswersMap;
  /** Already-sanitized custom slides (SafeSlide[]); default none. */
  customSlides?: SafeSlide[];
  /** Campaign template alias — drives the LVA branch + SU-Full audience policy. */
  templateAlias?: string | null;
  /** Whether the previewed respondent is the campaign CEO (SU-Full policy). */
  isCEO?: boolean;
}

/**
 * Assemble the survey page array exactly as the live INVITED survey would.
 * Returns the full `MergeResult` (`{ pages, droppedSlideIds }`) — callers that
 * only need the rendered pages read `.pages`.
 */
export function assembleSurveyPages(
  sections: PagerSection[],
  questions: PagerQuestion[],
  options: AssembleSurveyPagesOptions,
): MergeResult {
  const {
    answers,
    customSlides = [],
    templateAlias = null,
    isCEO = false,
  } = options;

  // 1. Audience policy: SU-Full non-CEO never sees the CEO-only background
  //    section (C3). Filter at the source, then sort by sortOrder — identical
  //    to org-survey-client's sortedSections / sortedQuestions.
  const dropBackground = templateAlias === SU_FULL_ALIAS && !isCEO;

  const sortedSections = [...sections]
    .filter(
      (s) => !(dropBackground && s.stableKey === SU_FULL_BACKGROUND_SECTION),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sortedQuestions = [...questions]
    .filter(
      (q) =>
        !(dropBackground && q.sectionStableKey === SU_FULL_BACKGROUND_SECTION),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 2. Visibility: LVA branch + generic authored show-if against `answers`.
  const visibleQuestions = filterVisibleSurveyQuestions({
    templateAlias,
    questions: sortedQuestions,
    answers,
  });

  // 3. Assembly: build section pages from the VISIBLE questions, suppress
  //    conditionally-emptied pages using the FULL sorted list (D7 attribution),
  //    then weave in custom slides.
  return mergeCustomSlides(
    filterConditionallyEmptiedPages(
      buildSectionPages(sortedSections, visibleQuestions),
      sortedQuestions,
    ),
    customSlides,
  );
}
