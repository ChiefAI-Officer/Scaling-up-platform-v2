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
import { useToast } from "@/components/ui/use-toast";
import type { MetadataTabValues } from "@/components/admin/template-editor/MetadataTab";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import {
  genUid,
  hydrateSectionsFromJson,
} from "@/components/admin/template-editor/sections-serialization";
import {
  hydrateQuestionsFromJson,
  genNewQuestionStableKey,
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
  questionEditorUnlocked,
  initialDirtyFlags,
}: UseTemplateEditorDraftArgs) {
  const { toast } = useToast();

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
  const handleScoringConfigChange = useCallback(
    (next: Record<string, unknown>) => {
      setScoringConfigState(next);
      scoringConfigRef.current = next;
      setScoringConfigDirty();
    },
    [setScoringConfigDirty],
  );

  const handleTemplateFieldChange = useCallback(
    (patch: Partial<Omit<MetadataTabValues, "language">>) => {
      setTemplateValues((prev) => ({ ...prev, ...patch }));
      setMetadataDirty();
    },
    [setMetadataDirty],
  );
  const handleVersionFieldChange = useCallback(
    (patch: { language?: string }) => {
      setVersionValues((prev) => ({ ...prev, ...patch }));
      setVersionDirty();
    },
    [setVersionDirty],
  );

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
  const handleSendResultsDefaultChange = useCallback(
    async (next: boolean) => {
      if (savingSendResultsDefault) return;
      setSavingSendResultsDefault(true);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sendResultsDefault: next }),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          // 403 = the Wave Q server flag is off (or was killed) — the write
          // capability is gated even if this UI rendered from a stale page.
          if (res.status === 403) {
            toast({
              title: "Could not update the results-email default",
              description:
                "Admin template controls are not enabled on the server.",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Could not update the results-email default",
            description:
              typeof body?.error === "string"
                ? body.error
                : "Please try again.",
            variant: "destructive",
          });
          return;
        }
        setSendResultsDefault(next);
        toast({
          title: next
            ? "Results email on by default"
            : "Results email off by default",
          description: next
            ? "New campaigns on this template start with the results email checked (once the content is approved)."
            : "New campaigns on this template start with the results email unchecked.",
        });
      } catch (e) {
        toast({
          title: "Could not update the results-email default",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setSavingSendResultsDefault(false);
      }
    },
    [savingSendResultsDefault, template.id, toast],
  );

  // Section operations — F2 / F2b.
  const handleSectionsAdd = useCallback(() => {
    setSections((prev) => [
      ...prev,
      {
        uid: genUid(),
        stableKey: `S${prev.length + 1}`,
        name: "",
      },
    ]);
    setSectionsDirty();
  }, [setSectionsDirty]);

  const handleSectionsRename = useCallback(
    (uid: string, name: string) => {
      setSections((prev) =>
        prev.map((s) => (s.uid === uid ? { ...s, name } : s)),
      );
      setSectionsDirty();
    },
    [setSectionsDirty],
  );

  const handleSectionsDelete = useCallback(
    (uid: string) => {
      setSections((prev) => prev.filter((s) => s.uid !== uid));
      setSectionsDirty();
    },
    [setSectionsDirty],
  );

  const handleSectionsMoveUp = useCallback(
    (uid: string) => {
      setSections((prev) => {
        const idx = prev.findIndex((s) => s.uid === uid);
        if (idx <= 0) return prev;
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      });
      setSectionsDirty();
    },
    [setSectionsDirty],
  );

  const handleSectionsMoveDown = useCallback(
    (uid: string) => {
      setSections((prev) => {
        const idx = prev.findIndex((s) => s.uid === uid);
        if (idx < 0 || idx >= prev.length - 1) return prev;
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        return next;
      });
      setSectionsDirty();
    },
    [setSectionsDirty],
  );

  // F3 retrofit — drag-reorder via @dnd-kit. Receives the new uid order
  // from SectionsCard's DndContext and re-sorts the sections array to
  // match (preserves uid identity + stableKey across moves).
  const handleSectionsReorder = useCallback(
    (newOrderUids: string[]) => {
      setSections((prev) => {
        const byUid = new Map(prev.map((s) => [s.uid, s]));
        const next: SectionDraft[] = [];
        for (const uid of newOrderUids) {
          const found = byUid.get(uid);
          if (found) next.push(found);
        }
        // Any rows not present in newOrderUids fall through at the end
        // to keep this defensive against partial lists.
        for (const s of prev) {
          if (!newOrderUids.includes(s.uid)) next.push(s);
        }
        return next;
      });
      setSectionsDirty();
    },
    [setSectionsDirty],
  );

  // ─── Question operations — F3 ─────────────────────────────────────────
  const handleAddQuestion = useCallback(
    (sectionStableKey: string) => {
      setQuestions((prev) => {
        const inSection = prev.filter(
          (q) => q.sectionStableKey === sectionStableKey,
        );
        const nextSort =
          inSection.reduce((max, q) => Math.max(max, q.sortOrder), 0) + 1;
        return [
          ...prev,
          {
            uid: genUid(),
            // Wave T D8 — unlocked, the slug key is derived from the label
            // AT SAVE (buildQuestionsPayload); until then the row shows
            // "(assigned on save)". Locked keeps the legacy Q_NEW_ key.
            stableKey: questionEditorUnlocked
              ? ""
              : genNewQuestionStableKey(),
            sectionStableKey,
            label: "",
            helpText: "",
            isRequired: true,
            type: "SLIDER_LIKERT",
            sortOrder: nextSort,
            scaleMin: 0,
            scaleMax: 3,
            scaleStep: 1,
            anchorMin: "Not true",
            anchorMax: "Completely true",
            options: [],
            maxChoices: null,
            isInherited: false,
            isNewToDraft: true,
            // Wave U — new questions start with no findings rules.
            findingBands: [],
            findingOptionTexts: {},
            // Wave W — new questions start unconditional.
            showIf: null,
          },
        ];
      });
      setQuestionsDirty();
    },
    [questionEditorUnlocked, setQuestionsDirty],
  );

  const handleUpdateQuestion = useCallback(
    (uid: string, patch: Partial<QuestionDraft>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.uid === uid ? { ...q, ...patch } : q)),
      );
      setQuestionsDirty();
    },
    [setQuestionsDirty],
  );

  const handleDeleteQuestion = useCallback(
    (uid: string) => {
      setQuestions((prev) => prev.filter((q) => q.uid !== uid));
      setQuestionsDirty();
    },
    [setQuestionsDirty],
  );

  const handleDuplicateQuestion = useCallback(
    (uid: string) => {
      setQuestions((prev) => {
        const src = prev.find((q) => q.uid === uid);
        if (!src) return prev;
        const inSection = prev.filter(
          (q) => q.sectionStableKey === src.sectionStableKey,
        );
        const nextSort =
          inSection.reduce((max, q) => Math.max(max, q.sortOrder), 0) + 1;
        return [
          ...prev,
          {
            ...src,
            uid: genUid(),
            // Wave T — a copy is a NEW question: unlocked it gets a slug
            // key at save; locked it keeps the legacy Q_NEW_ key. Either
            // way it is never inherited, and every copied option must be
            // isNew:true (the serializer's inherited-option re-check has
            // no raw row for a copy — spec 19t §T-3 Duplicate rule).
            stableKey: questionEditorUnlocked
              ? ""
              : genNewQuestionStableKey(),
            sortOrder: nextSort,
            isInherited: false,
            isNewToDraft: true,
            options: src.options.map((o) => ({ ...o, isNew: true })),
          },
        ];
      });
      setQuestionsDirty();
    },
    [questionEditorUnlocked, setQuestionsDirty],
  );

  const handleReorderQuestions = useCallback(
    (sectionStableKey: string, newOrderUids: string[]) => {
      setQuestions((prev) => {
        // Build a sortOrder map from newOrderUids: position-in-array → sortOrder.
        const order = new Map<string, number>();
        newOrderUids.forEach((uid, idx) => order.set(uid, idx + 1));
        return prev.map((q) =>
          q.sectionStableKey === sectionStableKey && order.has(q.uid)
            ? { ...q, sortOrder: order.get(q.uid)! }
            : q,
        );
      });
      setQuestionsDirty();
    },
    [setQuestionsDirty],
  );

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
    // ─── Change handlers ───
    handleScoringConfigChange,
    handleTemplateFieldChange,
    handleVersionFieldChange,
    handleSendResultsDefaultChange,
    handleSectionsAdd,
    handleSectionsRename,
    handleSectionsDelete,
    handleSectionsMoveUp,
    handleSectionsMoveDown,
    handleSectionsReorder,
    handleAddQuestion,
    handleUpdateQuestion,
    handleDeleteQuestion,
    handleDuplicateQuestion,
    handleReorderQuestions,
    // ─── Transitional raw setters (T4b→T4c) — consumed by handleSaveDraft,
    //     which still lives in TabbedShell until it is lifted in T4c. ───
    setQuestions,
    setDirtyFlags,
    setSavingDraft,
  };
}
