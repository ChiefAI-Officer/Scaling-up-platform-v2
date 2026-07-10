"use client";

/**
 * TemplateEditorTabbed — F1 (Checkpoint 1a).
 *
 * Wireframe rebuild Phase 1a. Smallest possible standalone surface for
 * the admin assessment template editor: persistent header + 5-tab nav
 * + URL-based tab persistence. Tab panels are empty placeholders for
 * F1; the real Metadata / Sections / Questions / Scoring & Tiers /
 * Versions panels land in subsequent checkpoints (F2-F6).
 *
 * Chrome matches WF16/17/18 exactly (see
 * src/public/wireframes-phase2/admin/16-admin-template-editor-meta.html
 * lines 700-900 for the canonical markup).
 *
 * Tabs (in order):
 *   1. Metadata        — active by default
 *   2. Sections
 *   3. Questions
 *   4. Scoring & Tiers
 *   5. Versions
 *   + Access           — link to /admin/assessments/access-groups (NOT a panel)
 * (The "Conditional Logic" ghost tab was removed in Wave W, spec 19w D5; the
 *  disabled "Preview as Respondent" header button in Wave W leftovers, spec 19z.)
 *
 * Cross-tab dirty state is lifted here. Future tab components call
 * setDirty(surface) to flip a flag; the beforeunload listener fires
 * a confirmation prompt when any flag is true. Save Draft (F2+) clears
 * all flags on success. F1 plumbs the state slice but no inputs mutate
 * it yet — `initialDirtyFlags` exists for test injection.
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F1).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  PublishFailureModal,
  type PublishFailureIssue,
} from "@/components/admin/PublishFailureModal";
import {
  MetadataTab,
  type MetadataTabValues,
} from "@/components/admin/template-editor/MetadataTab";
import { SectionsTab } from "@/components/admin/template-editor/SectionsTab";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import {
  genUid,
  hydrateSectionsFromJson,
} from "@/components/admin/template-editor/sections-serialization";
import {
  QuestionsTab,
  hydrateQuestionsFromJson,
  genNewQuestionStableKey,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";
import {
  QuestionSerializationError,
} from "@/components/admin/template-editor/question-serialization";
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
import {
  ScoringTiersTab,
  type ScoringConfigShape,
} from "@/components/admin/template-editor/ScoringTiersTab";
import { VersionsTab } from "@/components/admin/template-editor/VersionsTab";

// ────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────
type TabId =
  | "metadata"
  | "sections"
  | "questions"
  | "scoring"
  | "versions";

const VALID_TAB_IDS: TabId[] = [
  "metadata",
  "sections",
  "questions",
  "scoring",
  "versions",
];
// NOTE (Wave W, spec 19w D5): the disabled "Conditional Logic" ghost tab is
// GONE. Its WF18 copy ("renderer-side conditionalSections evaluation ships
// in v1") was never true in this codebase, and its conditional-REPORT-
// sections concept was superseded by Wave U findings (ADR-0021). Survey
// show-if authoring lives in the Questions tab's per-question
// "Show only when…" panel instead. A URL pointing at ?tab=conditional
// falls back to "metadata" exactly as before.

const TAB_LABELS: Record<TabId, string> = {
  metadata: "Metadata",
  sections: "Sections",
  questions: "Questions",
  scoring: "Scoring & Tiers",
  versions: "Versions",
};

// ────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────
export interface TemplateEditorTabbedTemplate {
  id: string;
  name: string;
  alias: string;
  // F2 (Checkpoint 1b) — the editor needs the full template metadata
  // surface so MetadataTab can render the Template Metadata + Invitation
  // Email + Results Email cards. All three Results Email fields land
  // here via F0 migration.
  description?: string | null;
  invitationSubject?: string;
  invitationBodyMarkdown?: string;
  resultsEmailSubject?: string | null;
  resultsEmailBodyMarkdown?: string | null;
  resultsEmailContentApproved?: boolean;
  /**
   * Wave Q item #1 — admin default for the wizard's #15 "email each
   * respondent their results" checkbox. TEMPLATE-ROW field (like
   * invitationSubject), never version content — stored while unapproved,
   * inert until the results email content is approved.
   */
  sendResultsDefault?: boolean;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  accessMode?: "INVITED" | "PUBLIC";
}

export interface TemplateEditorTabbedVersion {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  contentHash: string;
  // F2 — version content surfaces. Sections/Questions/Scoring are
  // version-locked + version-PATCHed. Optional so test fixtures that
  // only exercise the chrome stay byte-compatible.
  questions?: unknown;
  sections?: unknown;
  scoringConfig?: unknown;
  reportConfig?: unknown;
}

export interface TemplateEditorTabbedVersionMeta {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  /** F5 — Versions tab renders the first 12 chars in the row. */
  contentHash: string;
}

export interface DirtyFlags {
  metadata?: boolean;
  version?: boolean;
  sections?: boolean;
  questions?: boolean;
  scoringConfig?: boolean;
}

export interface TemplateEditorTabbedProps {
  template: TemplateEditorTabbedTemplate;
  version: TemplateEditorTabbedVersion;
  allVersions: TemplateEditorTabbedVersionMeta[];
  /** Callback invoked when Save Draft is clicked. F1 stub; F2 wires real persistence. */
  onSaveDraft?: () => void | Promise<void>;
  /** Test-only injection for the dirty state slice. */
  initialDirtyFlags?: DirtyFlags;
  /**
   * Wave Q — gates the "Send results to respondents by default" toggle (a
   * flag-gated write capability). Server-computed
   * (`isWaveQAdminControlsEnabled()`) and passed down from the edit page.
   */
  waveQEnabled?: boolean;
  /**
   * Wave T (spec 19t D2) — the question-editor type unlock. Server-computed
   * (`isQuestionEditorUnlockEnabled()`) and passed down from the edit page.
   * Default false ⇒ the legacy slider-only Questions tab renders unchanged.
   */
  questionEditorUnlocked?: boolean;
  /**
   * Wave T (spec 19t §T-4) — union of question stableKeys across ALL
   * published versions of the template. Drives inherited hydration + the
   * D8 union-scoped slug uniqueness in the save path (NOT flag-gated).
   */
  publishedQuestionKeys?: string[];
  /**
   * Wave T (spec 19t §T-4) — per-question union of published MULTI_CHOICE
   * option keys (inherited option-key locks + the D9 remove warning).
   */
  publishedOptionKeys?: Record<string, string[]>;
  /**
   * Wave U (spec 19u U-4) — findings-logic authoring. Server-computed
   * (`isFindingsLogicEnabled()`) and passed down from the edit page.
   * Default false ⇒ the Questions tab renders byte-identically to
   * pre-Wave-U (no Findings panel).
   */
  findingsEnabled?: boolean;
  /**
   * Wave W (spec 19w §2.6) — conditional (show-if) authoring. Server-
   * computed (`isConditionalAuthoringEnabled()`) and passed down from the
   * edit page. Default false ⇒ the Questions tab renders byte-identically
   * to pre-Wave-W (no "Show only when…" panel).
   */
  conditionalAuthoringEnabled?: boolean;
  /**
   * Wave ED1 (spec 19ac) — Test Mode sandbox. Server-computed
   * (`isTestModeEnabled()`) and passed down from the edit page. Client
   * components can't read the raw env var, so the flag is resolved server-side.
   */
  testModeEnabled?: boolean;
}

// Stable empty defaults so the memoized handlers don't churn.
const EMPTY_PUBLISHED_QUESTION_KEYS: string[] = [];
const EMPTY_PUBLISHED_OPTION_KEYS: Record<string, string[]> = {};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
function resolveTabFromUrl(param: string | null): TabId {
  if (param && (VALID_TAB_IDS as string[]).includes(param)) {
    return param as TabId;
  }
  return "metadata";
}

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────
export function TemplateEditorTabbed({
  template,
  version,
  allVersions,
  onSaveDraft,
  initialDirtyFlags,
  waveQEnabled = false,
  questionEditorUnlocked = false,
  publishedQuestionKeys = EMPTY_PUBLISHED_QUESTION_KEYS,
  publishedOptionKeys = EMPTY_PUBLISHED_OPTION_KEYS,
  findingsEnabled = false,
  conditionalAuthoringEnabled = false,
  testModeEnabled = false,
}: TemplateEditorTabbedProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const isPublished = version.publishedAt !== null;

  // ─── Tab selection ────────────────────────────────────────────────────
  const tabFromUrl = resolveTabFromUrl(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl);

  // Re-sync if the URL param changes externally (e.g. browser nav).
  useEffect(() => {
    const next = resolveTabFromUrl(searchParams.get("tab"));
    setActiveTab((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const handleTabChange = useCallback(
    (next: string) => {
      if (!(VALID_TAB_IDS as string[]).includes(next)) return;
      setActiveTab(next as TabId);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "metadata") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

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
  const rawQuestionsRef = React.useRef<unknown[]>(
    Array.isArray(version.questions) ? (version.questions as unknown[]) : [],
  );
  // Raw stored section rows — pass-through so a no-change save round-trips
  // byte-for-byte (content-hash stable) and unknown/future fields + domain
  // survive an edit to an unrelated surface (see sections-serialization.ts).
  const rawSectionsRef = React.useRef<unknown[]>(
    Array.isArray(version.sections) ? (version.sections as unknown[]) : [],
  );
  const scoringConfigRef = React.useRef<unknown>(version.scoringConfig ?? {});
  const reportConfigRef = React.useRef<unknown>(version.reportConfig ?? null);

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
  // The flip is independent of the results-email approval hash (a default
  // flip never invalidates approval) and inert until approval.
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

  // ─── Save Draft ───────────────────────────────────────────────────────
  const [savingDraft, setSavingDraft] = useState(false);
  // Wave ED1 (spec 19ac) — Test Mode drawer: drafts only, flag-gated.
  const [testModeOpen, setTestModeOpen] = useState(false);
  const testModeAvailable = !isPublished && testModeEnabled;
  const handleSaveDraft = useCallback(async () => {
    if (isPublished || savingDraft) return;
    if (!isAnyDirty) return;
    setSavingDraft(true);
    try {
      // F2: per-surface PATCH dispatch.
      // Template-level dirty (metadata) → PATCH /api/admin/assessment-templates/{id}
      // Version-level dirty (version + sections) → PATCH /api/admin/.../versions/{versionId}
      const needsVersionPatch =
        Boolean(dirtyFlags.version) ||
        Boolean(dirtyFlags.sections) ||
        Boolean(dirtyFlags.questions) ||
        Boolean(dirtyFlags.scoringConfig);

      // Serialize the version payloads BEFORE dispatching any fetch so a
      // serializer guard violation (Wave T) aborts the whole save without
      // a partial write.
      let sectionsPayload: unknown = null;
      let questionsPayload: unknown = null;
      // Wave T §T-3 — slug keys assigned at THIS save (uid → stableKey),
      // applied back to state after a successful PATCH.
      let assignedKeys: Map<string, string> = new Map();
      if (needsVersionPatch) {
        // Assemble sections + questions via the SHARED helper (spec 19ac C2)
        // so editor Test Mode scores byte-identically what Save persists —
        // ONE seam, real dirty flags (not forced). Sections: not-dirty →
        // rawSectionsRef passthrough; dirty → rebuilt (spread raw first,
        // preserving description/partLabel/domain + unknown fields, so SU
        // Full per-domain scoring survives a questions-only save). Questions
        // (Wave T §T-3): per-type serialization, scale only on sliders /
        // options only on MULTI_CHOICE, D8 slug keys for new-to-draft rows,
        // inherited key/type/option-key locks re-checked client-side.
        try {
          const built = buildVersionScoringPayload({
            questions,
            sections,
            rawQuestions: rawQuestionsRef.current,
            rawSections: rawSectionsRef.current,
            scoringConfig: scoringConfigRef.current,
            publishedKeys: new Set(publishedQuestionKeys),
            publishedOptionKeys,
            dirty: {
              questions: Boolean(dirtyFlags.questions),
              sections: Boolean(dirtyFlags.sections),
            },
          });
          questionsPayload = built.questions;
          sectionsPayload = built.sections;
          assignedKeys = built.assignedKeys;
        } catch (e) {
          if (e instanceof QuestionSerializationError) {
            toast({
              title: "Could not save draft",
              description: e.message,
              variant: "destructive",
            });
            return;
          }
          throw e;
        }
      }

      const ops: Array<Promise<{ ok: boolean; status: number; surface: string }>> = [];

      if (dirtyFlags.metadata) {
        const body: Record<string, unknown> = {
          name: templateValues.name,
          description:
            templateValues.description.length > 0
              ? templateValues.description
              : null,
          invitationSubject: templateValues.invitationSubject,
          invitationBodyMarkdown: templateValues.invitationBodyMarkdown,
          aggregationMode: templateValues.aggregationMode,
          resultsEmailSubject:
            templateValues.resultsEmailSubject.length > 0
              ? templateValues.resultsEmailSubject
              : null,
          resultsEmailBodyMarkdown:
            templateValues.resultsEmailBodyMarkdown.length > 0
              ? templateValues.resultsEmailBodyMarkdown
              : null,
          resultsEmailContentApproved:
            templateValues.resultsEmailContentApproved,
        };
        ops.push(
          fetch(`/api/admin/assessment-templates/${template.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).then((r) => ({
            ok: r.ok,
            status: r.status,
            surface: "metadata",
          })),
        );
      }

      if (needsVersionPatch) {
        const body: Record<string, unknown> = {
          questions: questionsPayload,
          sections: sectionsPayload,
          scoringConfig: scoringConfigRef.current,
          reportConfig: reportConfigRef.current,
        };
        if (dirtyFlags.version) {
          body.language = versionValues.language;
        }
        ops.push(
          fetch(
            `/api/admin/assessment-templates/${template.id}/versions/${version.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
          ).then((r) => ({
            ok: r.ok,
            status: r.status,
            surface: "version",
          })),
        );
      }

      const results = await Promise.all(ops);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        toast({
          title: "Could not save draft",
          description: `Save failed (${failed.surface}). Please try again.`,
          variant: "destructive",
        });
        return;
      }

      // Optional test/observability hook.
      await onSaveDraft?.();

      // Wave T (adversarial-review fix) — the version PATCH just persisted
      // these payloads, so they ARE the stored truth now. Without this, the
      // refs keep the page-load rows and the NEXT save with that surface
      // not-dirty (e.g. a sections-only save after adding questions) would
      // pass the STALE rows through and silently delete the just-saved
      // content.
      if (needsVersionPatch) {
        rawQuestionsRef.current = Array.isArray(questionsPayload)
          ? (questionsPayload as unknown[])
          : rawQuestionsRef.current;
        rawSectionsRef.current = Array.isArray(sectionsPayload)
          ? (sectionsPayload as unknown[])
          : rawSectionsRef.current;
      }

      // Wave T — the slug keys assigned at this save become the rows'
      // permanent stableKeys (immutable from here on, ADR-0020). Options on
      // MULTI_CHOICE rows are synced from the persisted payload in the same
      // pass (isNew:false + their derived keys) so an option-label rename on
      // a later save can never re-derive (change) an already-persisted
      // option key.
      if (needsVersionPatch && Array.isArray(questionsPayload)) {
        const applied = assignedKeys;
        const persistedByKey = new Map<string, Record<string, unknown>>();
        for (const row of questionsPayload as unknown[]) {
          if (row && typeof row === "object") {
            const r = row as Record<string, unknown>;
            if (typeof r.stableKey === "string") persistedByKey.set(r.stableKey, r);
          }
        }
        setQuestions((prev) =>
          prev.map((q) => {
            const finalKey = applied.get(q.uid) ?? q.stableKey;
            const persisted = persistedByKey.get(finalKey);
            const persistedOptions = Array.isArray(persisted?.options)
              ? (persisted!.options as Array<{ key: string; label: string }>).map(
                  (o) => ({ key: o.key, label: o.label, isNew: false }),
                )
              : q.options;
            if (finalKey === q.stableKey && persistedOptions === q.options) {
              return q;
            }
            return { ...q, stableKey: finalKey, options: persistedOptions };
          }),
        );
      }

      // Clear dirty flags on success.
      setDirtyFlags({});
      toast({ title: "Draft saved" });
      router.refresh();
    } catch (e) {
      toast({
        title: "Could not save draft",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingDraft(false);
    }
  }, [
    dirtyFlags,
    isAnyDirty,
    isPublished,
    onSaveDraft,
    publishedOptionKeys,
    publishedQuestionKeys,
    questions,
    router,
    savingDraft,
    sections,
    template.id,
    templateValues,
    toast,
    version.id,
    versionValues,
  ]);

  // ─── Publish (mirrors AssessmentTemplateDetail.handlePublish) ─────────
  // F5: handler accepts an explicit versionId so VersionsTab can publish
  // any draft row, not just the currently-edited version. Header button
  // calls it with the current version's id.
  const [publishingVersionId, setPublishingVersionId] = useState<
    string | null
  >(null);
  const publishing = publishingVersionId !== null;
  const [publishIssues, setPublishIssues] = useState<
    PublishFailureIssue[] | null
  >(null);
  const [duplicatingVersionId, setDuplicatingVersionId] = useState<
    string | null
  >(null);

  const handlePublishVersion = useCallback(
    async (versionId: string) => {
      if (publishingVersionId) return;
      const confirmed = window.confirm(
        "Publish this version? Once published, content is immutable.",
      );
      if (!confirmed) return;
      setPublishIssues(null);
      setPublishingVersionId(versionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${versionId}/publish`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (
            res.status === 422 &&
            Array.isArray(body?.issues) &&
            body.issues.every(
              (i: unknown) =>
                i !== null &&
                typeof i === "object" &&
                Array.isArray((i as { path?: unknown }).path) &&
                typeof (i as { message?: unknown }).message === "string",
            )
          ) {
            setPublishIssues(body.issues as PublishFailureIssue[]);
            return;
          }
          if (res.status === 409) {
            toast({
              title: "Already published",
              variant: "destructive",
            });
            router.refresh();
            return;
          }
          toast({
            title: "Could not publish",
            description:
              typeof body?.error === "string"
                ? body.error
                : "Please try again.",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Version published" });
        router.refresh();
      } catch (e) {
        toast({
          title: "Could not publish",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setPublishingVersionId(null);
      }
    },
    [publishingVersionId, router, template.id, toast],
  );

  const handlePublish = useCallback(() => {
    if (isPublished) return;
    return handlePublishVersion(version.id);
  }, [handlePublishVersion, isPublished, version.id]);

  const handleDuplicateVersion = useCallback(
    async (sourceVersionId: string) => {
      if (duplicatingVersionId) return;
      setDuplicatingVersionId(sourceVersionId);
      try {
        const res = await fetch(
          `/api/admin/assessment-templates/${template.id}/versions/${sourceVersionId}/duplicate`,
          { method: "POST" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        toast({
          title: "New draft created",
          description: `v${body.data.versionNumber} — opening editor…`,
        });
        window.location.href = `/admin/assessments/templates/${template.id}/versions/${body.data.newVersionId}/edit`;
      } catch (e) {
        toast({
          title: "Could not duplicate version",
          description: e instanceof Error ? e.message : "Please try again.",
          variant: "destructive",
        });
        setDuplicatingVersionId(null);
      }
    },
    [duplicatingVersionId, template.id, toast],
  );

  // ─── Versions caption ─────────────────────────────────────────────────
  const publishedSibling = useMemo(
    () =>
      allVersions.find(
        (v) => v.publishedAt !== null && v.id !== version.id,
      ),
    [allVersions, version.id],
  );

  const caption = useMemo(() => {
    if (isPublished) {
      return version.publishedAt
        ? `Published since ${new Date(version.publishedAt).toLocaleDateString(
            "en-US",
            { dateStyle: "medium" },
          )}`
        : "Published";
    }
    if (publishedSibling?.publishedAt) {
      return `Published v${publishedSibling.versionNumber} active since ${new Date(
        publishedSibling.publishedAt,
      ).toLocaleDateString("en-US", { dateStyle: "medium" })}`;
    }
    return "(you are here)";
  }, [isPublished, publishedSibling, version.publishedAt]);

  return (
    <div className="space-y-6">
      {/* ───────── Header (WF16/17/18 page-header-row) ───────── */}
      <header className="wf-page-header-row">
        <div className="wf-page-title-block">
          <h2 className="wf-page-title">{template.name}</h2>
          <div className="wf-page-pill-row">
            <span
              data-testid="template-editor-version-pill"
              className={
                isPublished
                  ? "wf-version-pill-published"
                  : "wf-version-pill-draft"
              }
            >
              v{version.versionNumber} ({isPublished ? "published" : "draft"})
            </span>
            <span className="wf-pill wf-pill-access-invited">
              {template.accessMode ?? "INVITED"}
            </span>
            <span className="wf-pill wf-pill-agg-full">
              {template.aggregationMode}
            </span>
            <span style={{ fontStyle: "italic" }}>{caption}</span>
          </div>
        </div>

        <div className="wf-page-action-row">
          {testModeAvailable && (
            <button
              type="button"
              onClick={() => setTestModeOpen(true)}
              className="wf-btn wf-btn-secondary wf-btn-sm"
              data-testid="template-editor-test-mode-btn"
            >
              Test Mode
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPublished || savingDraft || !isAnyDirty}
            className="wf-btn wf-btn-secondary wf-btn-sm"
            data-testid="template-editor-save-draft-btn"
          >
            {savingDraft ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Save Draft
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublished || publishing}
            data-testid="template-editor-publish-btn"
            className="wf-btn wf-btn-primary wf-btn-sm"
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Publish v{version.versionNumber} →
          </button>
        </div>
      </header>

      {/* Read-only banner. */}
      {isPublished && (
        <div
          style={{
            borderRadius: "6px",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--muted) / 0.4)",
            padding: "0.75rem 1rem",
            fontSize: "0.75rem",
            fontStyle: "italic",
            color: "hsl(var(--muted-foreground))",
            marginBottom: "1.5rem",
          }}
        >
          Published versions are read-only. Duplicate this version into a
          new draft from the template detail page to evolve the content.
        </div>
      )}

      {/* ───────── Tabs ───────── */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        aria-label="Template editor tabs"
      >
        <TabsList className="mb-6">
          <TabsTrigger value="metadata">
            {TAB_LABELS.metadata}
          </TabsTrigger>
          <TabsTrigger value="sections">
            {TAB_LABELS.sections}
          </TabsTrigger>
          <TabsTrigger value="questions">
            {TAB_LABELS.questions}
          </TabsTrigger>
          <TabsTrigger value="scoring">
            {TAB_LABELS.scoring}
          </TabsTrigger>
          {/* Access — link, not a tab panel. Per WF16 spec it navigates
              to /admin/assessments/access-groups. We render it inside the
              tab nav so it sits in the same visual row, but as a Radix
              tab trigger that doesn't have a panel. To keep keyboard
              semantics correct we mark it as a tab but override its
              click to navigate instead of switching panels. */}
          <Link
            href="/admin/assessments/access-groups"
            role="tab"
            aria-selected="false"
            data-testid="template-editor-access-link"
            className="inline-flex items-center gap-1.5 whitespace-nowrap px-0.5 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground"
          >
            Access
          </Link>
          <TabsTrigger value="versions">
            {TAB_LABELS.versions}
          </TabsTrigger>
        </TabsList>

        {/* F2 — Metadata tab (WF16). */}
        <TabsContent value="metadata">
          <div data-testid="tab-panel-metadata">
            <MetadataTab
              values={{
                name: templateValues.name,
                alias: templateValues.alias,
                description: templateValues.description,
                invitationSubject: templateValues.invitationSubject,
                invitationBodyMarkdown: templateValues.invitationBodyMarkdown,
                resultsEmailSubject: templateValues.resultsEmailSubject,
                resultsEmailBodyMarkdown:
                  templateValues.resultsEmailBodyMarkdown,
                resultsEmailContentApproved:
                  templateValues.resultsEmailContentApproved,
                aggregationMode: templateValues.aggregationMode,
                language: versionValues.language,
              }}
              onTemplateFieldChange={handleTemplateFieldChange}
              onVersionFieldChange={handleVersionFieldChange}
              sections={sections}
              questionCountByStableKey={questionCountByStableKey}
              onSectionsAdd={handleSectionsAdd}
              onSectionsRename={handleSectionsRename}
              onSectionsDelete={handleSectionsDelete}
              onSectionsMoveUp={handleSectionsMoveUp}
              onSectionsMoveDown={handleSectionsMoveDown}
              onSectionsReorder={handleSectionsReorder}
              allVersions={allVersions}
              currentVersionId={version.id}
              isReadOnly={isPublished}
              waveQEnabled={waveQEnabled}
              sendResultsDefault={sendResultsDefault}
              sendResultsDefaultSaving={savingSendResultsDefault}
              onSendResultsDefaultChange={handleSendResultsDefaultChange}
            />
          </div>
        </TabsContent>
        {/* F2b — Sections tab (standalone, full-width). */}
        <TabsContent value="sections">
          <div data-testid="tab-panel-sections">
            <SectionsTab
              sections={sections}
              questionCountByStableKey={questionCountByStableKey}
              onSectionsAdd={handleSectionsAdd}
              onSectionsRename={handleSectionsRename}
              onSectionsDelete={handleSectionsDelete}
              onSectionsMoveUp={handleSectionsMoveUp}
              onSectionsMoveDown={handleSectionsMoveDown}
              onSectionsReorder={handleSectionsReorder}
              isReadOnly={isPublished}
            />
          </div>
        </TabsContent>
        <TabsContent value="questions">
          <div data-testid="tab-panel-questions">
            <QuestionsTab
              sections={sections}
              questions={questions}
              onAddQuestion={handleAddQuestion}
              onUpdateQuestion={handleUpdateQuestion}
              onDeleteQuestion={handleDeleteQuestion}
              onDuplicateQuestion={handleDuplicateQuestion}
              onReorderQuestions={handleReorderQuestions}
              isReadOnly={isPublished}
              isUnlocked={questionEditorUnlocked}
              publishedOptionKeys={publishedOptionKeys}
              findingsEnabled={findingsEnabled}
              conditionalEnabled={conditionalAuthoringEnabled}
            />
          </div>
        </TabsContent>
        <TabsContent value="scoring">
          <div data-testid="tab-panel-scoring">
            <ScoringTiersTab
              sections={sections.map((s, idx) => ({
                stableKey: s.stableKey,
                sortOrder: idx + 1,
                name: s.name,
              }))}
              questions={questions.map((q) => ({
                stableKey: q.stableKey,
                sortOrder: q.sortOrder,
                sectionStableKey: q.sectionStableKey,
                type: "SLIDER_LIKERT" as const,
                label: q.label,
                isRequired: q.isRequired,
                scale: {
                  min: q.scaleMin,
                  max: q.scaleMax,
                  step: q.scaleStep,
                  anchorMin: q.anchorMin,
                  anchorMax: q.anchorMax,
                },
              }))}
              scoringConfig={scoringConfigState as ScoringConfigShape}
              isReadOnly={isPublished}
              onScoringConfigChange={(next) =>
                handleScoringConfigChange(next as Record<string, unknown>)
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <div data-testid="tab-panel-versions">
            <VersionsTab
              templateId={template.id}
              currentVersionId={version.id}
              versions={allVersions.map((v) => ({
                id: v.id,
                versionNumber: v.versionNumber,
                language: v.language,
                publishedAt: v.publishedAt,
                contentHash: v.contentHash,
              }))}
              publishingVersionId={publishingVersionId}
              duplicatingVersionId={duplicatingVersionId}
              onPublish={handlePublishVersion}
              onDuplicate={handleDuplicateVersion}
            />
          </div>
        </TabsContent>
      </Tabs>

      {testModeAvailable && (
        <TestModeDrawer
          open={testModeOpen}
          onClose={() => setTestModeOpen(false)}
          templateAlias={templateValues.alias}
          questions={questions}
          sections={sections}
          rawQuestions={rawQuestionsRef.current}
          rawSections={rawSectionsRef.current}
          scoringConfig={scoringConfigRef.current}
          publishedKeys={new Set(publishedQuestionKeys)}
          publishedOptionKeys={publishedOptionKeys}
          dirty={{
            questions: Boolean(dirtyFlags.questions),
            sections: Boolean(dirtyFlags.sections),
          }}
        />
      )}

      {/* Publish failure modal — mounted at the bottom; mirrors
          AssessmentTemplateDetail. */}
      <PublishFailureModal
        open={publishIssues !== null}
        issues={publishIssues ?? []}
        onClose={() => setPublishIssues(null)}
      />
    </div>
  );
}

/**
 * F1 plumbing for future tab components — surface a setter the children
 * can call to flip dirty flags. Not used in F1 (no inputs yet).
 *
 * Future:
 *   export type SetDirtyFn = (surface: keyof DirtyFlags, dirty: boolean) => void;
 *
 * For F1 we keep the setter scoped inside the component and don't
 * export it; F2 will introduce a TemplateEditorContext to thread it.
 */
