"use client";

/**
 * TemplateEditorTabbed — F1 (Checkpoint 1a).
 *
 * Wireframe rebuild Phase 1a. Smallest possible standalone surface for
 * the admin assessment template editor: persistent header + 7-tab nav
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
 *   5. Conditional Logic — disabled, v1.5 badge + tooltip
 *   6. Access          — link to /admin/assessments/access-groups (NOT a panel)
 *   7. Versions
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
  QuestionsTab,
  hydrateQuestionsFromJson,
  genNewQuestionStableKey,
  type QuestionDraft,
} from "@/components/admin/template-editor/QuestionsTab";

// ────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────
type TabId =
  | "metadata"
  | "sections"
  | "questions"
  | "scoring"
  | "conditional"
  | "versions";

const VALID_TAB_IDS: TabId[] = [
  "metadata",
  "sections",
  "questions",
  "scoring",
  "versions",
];
// NOTE: "conditional" is NOT in VALID_TAB_IDS — it's disabled and any
// URL pointing at it falls back to "metadata".

const TAB_LABELS: Record<TabId, string> = {
  metadata: "Metadata",
  sections: "Sections",
  questions: "Questions",
  scoring: "Scoring & Tiers",
  conditional: "Conditional Logic",
  versions: "Versions",
};

const CONDITIONAL_LOGIC_TOOLTIP =
  "Available in v1.5 — for v1, admins seed conditionalSections JSON via Prisma Studio";

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
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
function resolveTabFromUrl(param: string | null): TabId {
  if (param && (VALID_TAB_IDS as string[]).includes(param)) {
    return param as TabId;
  }
  return "metadata";
}

function genUid(): string {
  return `u${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Hydrate the version.sections JSON payload into UI-editable SectionDraft
 * rows. Tolerant of partial / unknown shapes per the canonical pattern in
 * AssessmentVersionEditor.
 */
function hydrateSectionsFromJson(raw: unknown): SectionDraft[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((s, idx) => {
    const r = s as { stableKey?: unknown; name?: unknown };
    return {
      uid: genUid(),
      stableKey:
        typeof r.stableKey === "string" && r.stableKey.length > 0
          ? r.stableKey
          : `S${idx + 1}`,
      name: typeof r.name === "string" ? r.name : "",
    };
  });
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
    hydrateQuestionsFromJson(version.questions),
  );

  // Stable references for scoringConfig / reportConfig so version PATCH
  // can round-trip them unchanged when only sections/questions were
  // edited. Questions raw pass-through is kept here for stableKey lookup
  // during serialization (matches AssessmentVersionEditor's pattern).
  const rawQuestionsRef = React.useRef<unknown[]>(
    Array.isArray(version.questions) ? (version.questions as unknown[]) : [],
  );
  const scoringConfigRef = React.useRef<unknown>(version.scoringConfig ?? {});
  const reportConfigRef = React.useRef<unknown>(version.reportConfig ?? null);

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
            stableKey: genNewQuestionStableKey(),
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
          },
        ];
      });
      setQuestionsDirty();
    },
    [setQuestionsDirty],
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
            stableKey: genNewQuestionStableKey(),
            sortOrder: nextSort,
          },
        ];
      });
      setQuestionsDirty();
    },
    [setQuestionsDirty],
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
  const handleSaveDraft = useCallback(async () => {
    if (isPublished || savingDraft) return;
    if (!isAnyDirty) return;
    setSavingDraft(true);
    try {
      // F2: per-surface PATCH dispatch.
      // Template-level dirty (metadata) → PATCH /api/admin/assessment-templates/{id}
      // Version-level dirty (version + sections) → PATCH /api/admin/.../versions/{versionId}
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

      const needsVersionPatch =
        Boolean(dirtyFlags.version) ||
        Boolean(dirtyFlags.sections) ||
        Boolean(dirtyFlags.questions) ||
        Boolean(dirtyFlags.scoringConfig);

      if (needsVersionPatch) {
        const sectionsPayload = sections.map((s, idx) => ({
          stableKey:
            s.stableKey && s.stableKey.length > 0
              ? s.stableKey
              : `S${idx + 1}`,
          name: s.name,
        }));

        // F3 — Serialize questions. When questions are dirty, rebuild
        // each row from the draft, looking up the raw row by stableKey
        // (preserves recommendations[], unknown future fields, etc.).
        // When not dirty, pass through rawQuestionsRef byte-for-byte.
        let questionsPayload: unknown;
        if (dirtyFlags.questions) {
          const rawByStableKey = new Map<string, Record<string, unknown>>();
          for (const r of rawQuestionsRef.current) {
            if (r && typeof r === "object") {
              const row = r as Record<string, unknown>;
              if (typeof row.stableKey === "string") {
                rawByStableKey.set(row.stableKey, row);
              }
            }
          }
          questionsPayload = questions.map((q) => {
            const raw = rawByStableKey.get(q.stableKey) ?? {};
            const rawScale =
              raw.scale && typeof raw.scale === "object"
                ? (raw.scale as Record<string, unknown>)
                : {};
            return {
              ...raw,
              stableKey: q.stableKey,
              sectionStableKey: q.sectionStableKey,
              sortOrder: q.sortOrder,
              type: q.type,
              label: q.label,
              ...(q.helpText.trim() ? { helpText: q.helpText } : {}),
              isRequired: q.isRequired,
              scale: {
                ...rawScale,
                min: q.scaleMin,
                max: q.scaleMax,
                step: q.scaleStep,
                anchorMin: q.anchorMin,
                anchorMax: q.anchorMax,
              },
            };
          });
        } else {
          questionsPayload = rawQuestionsRef.current;
        }

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
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<
    PublishFailureIssue[] | null
  >(null);

  const handlePublish = useCallback(async () => {
    if (publishing || isPublished) return;
    const confirmed = window.confirm(
      "Publish this version? Once published, content is immutable.",
    );
    if (!confirmed) return;
    setPublishIssues(null);
    setPublishing(true);
    try {
      const res = await fetch(
        `/api/admin/assessment-templates/${template.id}/versions/${version.id}/publish`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Same modal-narrowing logic as AssessmentTemplateDetail.
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
      setPublishing(false);
    }
  }, [isPublished, publishing, router, template.id, toast, version.id]);

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
      {/* ───────── Header ───────── */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {template.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="template-editor-version-pill"
              className={
                isPublished
                  ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-success/10 text-success ring-1 ring-success/20"
                  : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-warning/10 text-warning ring-1 ring-warning/20"
              }
            >
              v{version.versionNumber} ({isPublished ? "published" : "draft"})
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
              {template.accessMode ?? "INVITED"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              {template.aggregationMode}
            </span>
            <span className="text-xs italic text-muted-foreground">
              {caption}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="Coming in v1.5"
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Preview as Respondent
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPublished || savingDraft || !isAnyDirty}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Publish v{version.versionNumber} →
          </button>
        </div>
      </header>

      {/* Read-only banner (matches AssessmentVersionEditor copy). */}
      {isPublished && (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-xs italic text-muted-foreground">
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
          <TabsTrigger
            value="conditional"
            disabled
            aria-disabled="true"
            title={CONDITIONAL_LOGIC_TOOLTIP}
            // Defensive: ignore clicks even if the disabled state is
            // bypassed by a screen reader.
            onClick={(e) => e.preventDefault()}
          >
            {TAB_LABELS.conditional}
            <span className="ml-1 inline-flex items-center px-1 py-px rounded text-[0.625rem] font-bold uppercase tracking-wider bg-warning/20 text-warning">
              v1.5
            </span>
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
            />
          </div>
        </TabsContent>
        <TabsContent value="scoring">
          <div
            data-testid="tab-panel-scoring"
            className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Scoring &amp; Tiers tab (F4)
          </div>
        </TabsContent>
        <TabsContent value="versions">
          <div
            data-testid="tab-panel-versions"
            className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Versions tab (F5)
          </div>
        </TabsContent>
      </Tabs>

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
