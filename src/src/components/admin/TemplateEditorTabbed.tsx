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
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  accessMode?: "INVITED" | "PUBLIC";
}

export interface TemplateEditorTabbedVersion {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  contentHash: string;
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
    setSavingDraft(true);
    try {
      await onSaveDraft?.();
      // F1: actual save logic is plumbed by tab components in F2+.
      // For now, clear dirty flags as a no-op shape the future
      // implementation will preserve.
      setDirtyFlags({});
    } finally {
      setSavingDraft(false);
    }
  }, [isPublished, onSaveDraft, savingDraft]);

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
            disabled={isPublished || savingDraft}
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

        {/* Placeholder panels — real content lands in F2+. */}
        <TabsContent value="metadata">
          <div
            data-testid="tab-panel-metadata"
            className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Metadata tab (F2)
          </div>
        </TabsContent>
        <TabsContent value="sections">
          <div
            data-testid="tab-panel-sections"
            className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Sections tab (F2)
          </div>
        </TabsContent>
        <TabsContent value="questions">
          <div
            data-testid="tab-panel-questions"
            className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground"
          >
            Questions tab (F3)
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
