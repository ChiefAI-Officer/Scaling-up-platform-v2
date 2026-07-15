/**
 * single-column-view-model — ED6 (spec 19ah §15.6), Task 6.
 *
 * PURE derivation of the per-card display data for the single-column builder,
 * computed ONCE over the whole instrument (co-validate §15.6) so editing one
 * card never triggers an O(n) (let alone O(n²)) re-derivation per row. The
 * builder maps `questions` grouped by section into a `Map<uid, CardViewModel>`;
 * each collapsed card is then handed only its primitive `uid` + its pre-derived
 * slice + stable handlers, so `React.memo` can skip unchanged cards.
 *
 * Badges are the honest-data signal — a plain slider (no findings / no show-if,
 * assigned, optional) yields ALL-false badges and reads identically to Google
 * Forms. Detection mirrors the serializer's own emission rules
 * (`question-serialization.ts`): findings = a `findingBands` entry OR a
 * non-blank `findingOptionTexts` value; show-if = a non-null rule with both
 * keys set (and only when conditional authoring is enabled).
 */

import type { SectionDraft } from "./SectionsCard";
import type { QuestionDraftRow } from "./question-serialization";

export interface CardBadges {
  findings: boolean;
  showIf: boolean;
  required: boolean;
  /** The question's `sectionStableKey` resolves to no section. */
  unassigned: boolean;
}

export interface CardViewModel {
  uid: string;
  stableKey: string;
  type: string;
  label: string;
  sectionStableKey: string;
  /** 1-based index within the question's section (ascending `sortOrder`). */
  position: number;
  badges: CardBadges;
}

export interface ViewModelOptions {
  /** Wave W — show-if badge only lights when conditional authoring is on. */
  conditionalEnabled: boolean;
}

function hasFindings(q: QuestionDraftRow): boolean {
  if (q.findingBands.length > 0) return true;
  return Object.values(q.findingOptionTexts).some((t) => t.trim() !== "");
}

function hasShowIf(q: QuestionDraftRow, conditionalEnabled: boolean): boolean {
  return (
    conditionalEnabled &&
    q.showIf != null &&
    q.showIf.questionKey !== "" &&
    q.showIf.optionKey !== ""
  );
}

/**
 * Build the full per-card view-model map in a SINGLE pass. Position is computed
 * per section (ascending `sortOrder`) up front; every other badge is a local
 * field read — no per-row cross-question scan.
 */
export function buildCardViewModels(
  questions: readonly QuestionDraftRow[],
  sections: readonly SectionDraft[],
  options: ViewModelOptions,
): Map<string, CardViewModel> {
  const sectionKeys = new Set(sections.map((s) => s.stableKey));

  // 1-based position within each section (ascending sortOrder), computed once.
  const position = new Map<string, number>();
  for (const s of sections) {
    questions
      .filter((q) => q.sectionStableKey === s.stableKey)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((q, i) => position.set(q.uid, i + 1));
  }

  const out = new Map<string, CardViewModel>();
  for (const q of questions) {
    out.set(q.uid, {
      uid: q.uid,
      stableKey: q.stableKey,
      type: q.type,
      label: q.label,
      sectionStableKey: q.sectionStableKey,
      position: position.get(q.uid) ?? 0,
      badges: {
        findings: hasFindings(q),
        showIf: hasShowIf(q, options.conditionalEnabled),
        required: q.isRequired,
        unassigned: !sectionKeys.has(q.sectionStableKey),
      },
    });
  }
  return out;
}
