/**
 * question-widget-mapper — ED5 Task 1 (B-4 DRY, co-validate C1).
 *
 * `QuestionCanvas`'s local `toForInput` and `QuestionInspector`'s
 * `FindingsPreview` local `forInput` object were near-duplicate mappers from
 * a draft question row (`QuestionDraftRow`) to the respondent-widget shape
 * (`QuestionForInput`) that had diverged over time. This module is the single
 * shared mapper both call sites now use, plus a `shapeSignature` that
 * captures only the WIDGET SHAPE (type + scale + option-count/maxChoices) —
 * used later to detect when a preview's local answer state has gone stale
 * relative to the question's current shape (not its label/help/required,
 * which don't affect what the widget renders).
 */
import type { QuestionForInput } from "@/components/assessments/question-input";
import type { QuestionDraftRow } from "./question-serialization";

export interface MapperOpts {
  /** Used when `q.label` is empty. */
  labelFallback: string;
  /** Used when `q.stableKey` is empty. */
  keyFallback: string;
  /** When set, overrides `q.isRequired` outright (e.g. findings preview always non-required). */
  forceRequired?: boolean;
}

/** Map an editor draft question to the respondent-widget shape. */
export function toQuestionForInput(
  q: QuestionDraftRow,
  opts: MapperOpts,
): QuestionForInput {
  return {
    stableKey: q.stableKey || opts.keyFallback,
    type: q.type,
    label: q.label || opts.labelFallback,
    isRequired: opts.forceRequired ?? q.isRequired,
    ...(q.type === "SLIDER_LIKERT"
      ? {
          scale: {
            min: q.scaleMin,
            max: q.scaleMax,
            step: q.scaleStep,
            anchorMin: q.anchorMin,
            anchorMax: q.anchorMax,
          },
        }
      : {}),
    ...(q.type === "MULTI_CHOICE"
      ? {
          options: q.options
            .filter((o) => o.key !== "")
            .map((o) => ({ key: o.key, label: o.label || o.key })),
          ...(q.maxChoices !== null ? { maxChoices: q.maxChoices } : {}),
        }
      : {}),
  };
}

/**
 * A signature of the WIDGET SHAPE only — deliberately excludes label,
 * helpText, and isRequired, none of which change what `QuestionInput`
 * renders or how an in-progress preview answer should be interpreted.
 */
export function shapeSignature(q: QuestionDraftRow): string {
  const parts = [q.type];
  if (q.type === "SLIDER_LIKERT") {
    parts.push(String(q.scaleMin), String(q.scaleMax), String(q.scaleStep));
  }
  if (q.type === "MULTI_CHOICE") {
    const optionCount = q.options.filter((o) => o.key !== "").length;
    parts.push(String(optionCount), String(q.maxChoices ?? -1));
  }
  return parts.join("|");
}
