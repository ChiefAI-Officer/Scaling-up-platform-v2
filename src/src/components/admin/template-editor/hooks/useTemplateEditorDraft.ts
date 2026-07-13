"use client";

/**
 * useTemplateEditorDraft — ED3 (spec 19ae), Task 4.
 *
 * Headless owner of the editor's DOCUMENT MODEL + SAVE FLOW. Lifted VERBATIM
 * out of `TabbedShell` (Codex C3 — ONE hook, deliberately NOT over-split):
 *
 *   - editable state: template metadata, version language, sections,
 *     questions, scoringConfig (UI copy), the cross-tab dirty flags, the
 *     Save-Draft in-flight guard, and the independent Wave-Q
 *     sendResultsDefault toggle;
 *   - the raw pass-through REFS (`rawQuestionsRef` / `rawSectionsRef` /
 *     `scoringConfigRef` / `reportConfigRef`) — returned as the ref OBJECTS so
 *     callers read `.current` exactly as before;
 *   - the per-surface dirty setters + the change handlers;
 *   - `handleSaveDraft` (serialize-before-fetch fail-atomic + the Wave-T
 *     post-save reconciliation that prevents the sections-only follow-up-save
 *     data-loss bug).
 *
 * MECHANICAL LIFT — ZERO behavior change. Every `useCallback`/`useMemo`
 * identity, dependency array, ref, and the scoringConfig state+ref DUAL-COPY
 * is preserved byte-for-byte. Pinned end-to-end by the golden guard
 * `editor-byte-equivalence.test.tsx` and directly by this hook's own unit
 * tests. `sendResultsDefault` stays its own immediate-PATCH path (NOT part of
 * Save/dirty). Publish/duplicate + tab/URL + Test-Mode-open state remain view
 * concerns in `TabbedShell` (or later `useVersionActions`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import { hydrateSectionsFromJson } from "@/components/admin/template-editor/sections-serialization";
import {
  hydrateQuestionsFromJson,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";
import type {
  TemplateEditorTabbedTemplate,
  TemplateEditorTabbedVersion,
  DirtyFlags,
} from "@/components/admin/template-editor/TabbedShell";

export interface UseTemplateEditorDraftArgs {
  template: TemplateEditorTabbedTemplate;
  version: TemplateEditorTabbedVersion;
  /** Union of stableKeys across all published versions (hydration + save). */
  publishedQuestionKeys: string[];
  /** Per-question union of published MULTI_CHOICE option keys (save). */
  publishedOptionKeys: Record<string, string[]>;
  /** Wave T — new-question slug-key-at-save vs legacy Q_NEW_ key. */
  questionEditorUnlocked: boolean;
  /**
   * Wave Q — the admin-controls flag. NOT read by the document model / save
   * flow; the toggle PATCHes unconditionally and the server enforces the flag
   * (403). Declared here for signature completeness (the flag gates RENDERING
   * of the toggle in `MetadataTab`, which stays in `TabbedShell`).
   */
  waveQEnabled: boolean;
  /** Optional test/observability hook, awaited after a successful save. */
  onSaveDraft?: () => void | Promise<void>;
  /** Test-only injection for the dirty state slice. */
  initialDirtyFlags?: DirtyFlags;
}

export function useTemplateEditorDraft({
  template,
  version,
  publishedQuestionKeys,
  initialDirtyFlags,
}: UseTemplateEditorDraftArgs) {
  // ─── Cross-tab dirty state ────────────────────────────────────────────
  const [dirtyFlags, setDirtyFlags] = useState<DirtyFlags>(
    initialDirtyFlags ?? {},
  );
  const isAnyDirty = useMemo(
    () => Object.values(dirtyFlags).some(Boolean),
    [dirtyFlags],
  );

  // ─── Editable state — F2 (Checkpoint 1b) ──────────────────────────────
  // Template-level editable fields. Hydrate from props; flip `metadata`
  // dirty on any edit. Save Draft serializes these into a single
  // template PATCH.
  const [templateValues, setTemplateValues] = useState({
    name: template.name,
    alias: template.alias,
    description: template.description ?? "",
    invitationSubject: template.invitationSubject ?? "",
    invitationBodyMarkdown: template.invitationBodyMarkdown ?? "",
    resultsEmailSubject: template.resultsEmailSubject ?? "",
    resultsEmailBodyMarkdown: template.resultsEmailBodyMarkdown ?? "",
    resultsEmailContentApproved:
      template.resultsEmailContentApproved ?? false,
    aggregationMode: template.aggregationMode,
  });

  // Version-level editable fields (language only, in this checkpoint).
  const [versionValues, setVersionValues] = useState({
    language: version.language,
  });

  // Sections — hydrated from version.sections JSON. Dirty flag fires on
  // any add/rename/reorder/delete. Save Draft hits the version PATCH
  // with current questions/scoringConfig pass-through.
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    hydrateSectionsFromJson(version.sections),
  );

  // F3 — Questions state hydrated from version.questions JSON. Dirty flag
  // fires on any add/edit/reorder/delete. Save Draft serializes these
  // into the version PATCH's questions[] (raw rows are preserved via
  // rawQuestionByStableKey lookup so unknown fields survive).
  const [questions, setQuestions] = useState<QuestionDraft[]>(() =>
    hydrateQuestionsFromJson(version.questions, new Set(publishedQuestionKeys)),
  );

  // Stable references for scoringConfig / reportConfig so version PATCH
  // can round-trip them unchanged when only sections/questions were
  // edited. Questions raw pass-through is kept here for stableKey lookup
  // during serialization (matches AssessmentVersionEditor's pattern).
  const rawQuestionsRef = useRef<unknown[]>(
    Array.isArray(version.questions) ? (version.questions as unknown[]) : [],
  );
  // Raw stored section rows — pass-through so a no-change save round-trips
  // byte-for-byte (content-hash stable) and unknown/future fields + domain
  // survive an edit to an unrelated surface (see sections-serialization.ts).
  const rawSectionsRef = useRef<unknown[]>(
    Array.isArray(version.sections) ? (version.sections as unknown[]) : [],
  );
  const scoringConfigRef = useRef<unknown>(version.scoringConfig ?? {});
  const reportConfigRef = useRef<unknown>(version.reportConfig ?? null);

  // F4 — Scoring & Tiers tab state. Hydrate from version.scoringConfig.
  // On any edit, update scoringConfigRef.current (so Save Draft serializes
  // it via version PATCH) and flip the scoringConfig dirty flag.
  const [scoringConfigState, setScoringConfigState] = useState<
    Record<string, unknown>
  >(
    () =>
      (version.scoringConfig && typeof version.scoringConfig === "object"
        ? (version.scoringConfig as Record<string, unknown>)
        : {}),
  );

  // Derived: question count per section stableKey (for the Sections card
  // count badge — used by MetadataTab right column + SectionsTab).
  const questionCountByStableKey = useMemo(() => {
    const out: Record<string, number> = {};
    for (const q of questions) {
      out[q.sectionStableKey] = (out[q.sectionStableKey] ?? 0) + 1;
    }
    return out;
  }, [questions]);

  // ─── Setters that auto-dirty the right surface ────────────────────────
  const setMetadataDirty = useCallback(() => {
    setDirtyFlags((prev) =>
      prev.metadata ? prev : { ...prev, metadata: true },
    );
  }, []);
  const setVersionDirty = useCallback(() => {
    setDirtyFlags((prev) =>
      prev.version ? prev : { ...prev, version: true },
    );
  }, []);
  const setSectionsDirty = useCallback(() => {
    setDirtyFlags((prev) =>
      prev.sections ? prev : { ...prev, sections: true },
    );
  }, []);
  const setQuestionsDirty = useCallback(() => {
    setDirtyFlags((prev) =>
      prev.questions ? prev : { ...prev, questions: true },
    );
  }, []);
  const setScoringConfigDirty = useCallback(() => {
    setDirtyFlags((prev) =>
      prev.scoringConfig ? prev : { ...prev, scoringConfig: true },
    );
  }, []);

  // ─── Wave Q (#1) — sendResultsDefault toggle ──────────────────────────
  // TEMPLATE-ROW field (like invitationSubject) — deliberately OUTSIDE the
  // Save Draft / dirty-flags flow: Save Draft is unavailable on published
  // versions, but this default must stay editable regardless of version
  // publish state, so the switch PATCHes the template row immediately.
  const [sendResultsDefault, setSendResultsDefault] = useState(
    template.sendResultsDefault ?? false,
  );
  const [savingSendResultsDefault, setSavingSendResultsDefault] =
    useState(false);

  // ─── Save Draft — in-flight guard ─────────────────────────────────────
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!isAnyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the returned string but still show a
      // generic "Leave site?" prompt when preventDefault is called.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [isAnyDirty]);

  return {
    // ─── State ───
    templateValues,
    versionValues,
    sections,
    questions,
    scoringConfigState,
    dirtyFlags,
    isAnyDirty,
    savingDraft,
    sendResultsDefault,
    savingSendResultsDefault,
    questionCountByStableKey,
    // ─── Refs (return the ref OBJECTS — callers read `.current`) ───
    rawQuestionsRef,
    rawSectionsRef,
    scoringConfigRef,
    reportConfigRef,
    // ─── Dirty setters ───
    setMetadataDirty,
    setVersionDirty,
    setSectionsDirty,
    setQuestionsDirty,
    setScoringConfigDirty,
    // ─── Transitional raw setters (T4a→T4c) — consumed by handlers that
    //     still live in TabbedShell until they are lifted in T4b/T4c. ───
    setTemplateValues,
    setVersionValues,
    setSections,
    setQuestions,
    setScoringConfigState,
    setDirtyFlags,
    setSavingDraft,
    setSendResultsDefault,
    setSavingSendResultsDefault,
  };
}
