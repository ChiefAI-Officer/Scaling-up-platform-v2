/**
 * Assemble the scoring-relevant version payload from live editor state,
 * exactly as Save Draft persists it — so editor Test Mode scores what would
 * be published (spec 19ac C2). Uses the editor's REAL dirty flags (NOT forced):
 * clean → raw pass-through (== persisted); dirty → reserialize (== next save).
 * Shared by handleSaveDraft AND the Test Mode drawer. May throw
 * QuestionSerializationError (inherited key/type-lock) — callers handle it.
 */
import {
  buildQuestionsPayload,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";
import { buildSectionsPayload } from "@/components/admin/template-editor/sections-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

export interface BuildVersionScoringPayloadArgs {
  questions: QuestionDraftRow[];
  sections: SectionDraft[];
  rawQuestions: unknown[];
  rawSections: unknown[];
  scoringConfig: unknown;
  publishedKeys: ReadonlySet<string>;
  publishedOptionKeys: Readonly<Record<string, readonly string[]>>;
  dirty: { questions: boolean; sections: boolean };
}

export interface BuildVersionScoringPayloadResult {
  questions: unknown[];
  sections: unknown;
  scoringConfig: unknown;
  assignedKeys: Map<string, string>;
}

export function buildVersionScoringPayload(
  args: BuildVersionScoringPayloadArgs,
): BuildVersionScoringPayloadResult {
  const sections = buildSectionsPayload(args.sections, {
    sectionsDirty: args.dirty.sections,
    rawSections: args.rawSections,
  });
  const q = buildQuestionsPayload(args.questions, {
    questionsDirty: args.dirty.questions,
    rawQuestions: args.rawQuestions,
    publishedKeys: args.publishedKeys,
    publishedOptionKeys: args.publishedOptionKeys,
  });
  return {
    // buildQuestionsPayload types `payload` as `unknown`, but by contract it is
    // always the questions array (raw pass-through when clean, mapped rows when
    // dirty). The cast preserves the reference (clean === opts.rawQuestions).
    questions: q.payload as unknown[],
    sections,
    scoringConfig: args.scoringConfig,
    assignedKeys: q.assignedKeys,
  };
}
