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
  QuestionSerializationError,
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
  // Defense-in-depth (ED5 T12 / co-validate C3): a question whose non-empty
  // sectionStableKey resolves to no section is corruption that must never
  // persist (the pre-cascade orphan-delete bug's signature). Fail closed like
  // the other serializer guards — the save aborts (zero fetch + destructive
  // toast) rather than writing an orphaned question. Empty keys are tolerated
  // (the "Other" bucket), mirroring the publish-time `checkSectionRefsResolve`.
  // NOTE: a dangling show-if is deliberately NOT blocked here — Wave W permits
  // authoring an in-progress conditional, and the publish gate's
  // `checkShowIfIntegrity` is the referential-integrity boundary for show-if.
  const knownSectionKeys = new Set(
    (Array.isArray(sections) ? sections : []).flatMap((s) => {
      const k = (s as { stableKey?: unknown }).stableKey;
      return typeof k === "string" && k.length > 0 ? [k] : [];
    }),
  );
  for (const row of q.payload as unknown[]) {
    const rawKey = (row as { sectionStableKey?: unknown }).sectionStableKey;
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    if (key.length > 0 && !knownSectionKeys.has(key)) {
      throw new QuestionSerializationError(
        "ORPHAN_SECTION_REF",
        `question references unknown section "${key}" — save aborted to avoid persisting an orphaned question`,
      );
    }
  }
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
