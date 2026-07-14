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
import { PublishFailureModal } from "@/components/admin/PublishFailureModal";
import { MetadataTab } from "@/components/admin/template-editor/MetadataTab";
import { SectionsTab } from "@/components/admin/template-editor/SectionsTab";
import { QuestionsTab } from "@/components/admin/template-editor/QuestionsTab";
import { ThreePaneWorkspace } from "@/components/admin/template-editor/ThreePaneWorkspace";
import type { TemplateEditorModel } from "@/components/admin/template-editor/hooks/useTemplateEditorModel";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
import { SafeToPublishBadge } from "@/components/admin/template-editor/SafeToPublishBadge";
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

export interface TabbedShellProps {
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
  /**
   * Wave ED2 (spec 19ad) — Safe-to-Publish live readout. Server-computed
   * (`isSafeToPublishEnabled()`) and passed down from the edit page.
   */
  safeToPublishEnabled?: boolean;
  /**
   * Wave ED4 (spec 19af §3.1/§3.2) — three-pane authoring workspace.
   * Server-computed (`isThreePaneEnabled()`) and passed down from the edit
   * page. Default false ⇒ the Questions tab body renders the legacy
   * `QuestionsTab` (byte-identical to today) and the default landing tab
   * stays Metadata. True ⇒ the Questions body swaps to `ThreePaneWorkspace`,
   * the tab is relabeled "Edit", and it becomes the default landing tab.
   */
  threePaneEnabled?: boolean;
}

/**
 * ED3 (spec 19ae) — backward-compat alias. `TemplateEditorTabbed.tsx` at the
 * old location re-exports this under the pre-split name so any importer
 * relying on the props type continues to resolve.
 */
export type TemplateEditorTabbedProps = TabbedShellProps;

// Stable empty defaults so the memoized handlers don't churn.
const EMPTY_PUBLISHED_QUESTION_KEYS: string[] = [];
const EMPTY_PUBLISHED_OPTION_KEYS: Record<string, string[]> = {};

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
function resolveTabFromUrl(
  param: string | null,
  defaultTab: TabId = "metadata",
): TabId {
  if (param && (VALID_TAB_IDS as string[]).includes(param)) {
    return param as TabId;
  }
  return defaultTab;
}

// ────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────
export function TabbedShell({
  template,
  version,
  allVersions,
  waveQEnabled = false,
  questionEditorUnlocked = false,
  publishedQuestionKeys = EMPTY_PUBLISHED_QUESTION_KEYS,
  publishedOptionKeys = EMPTY_PUBLISHED_OPTION_KEYS,
  findingsEnabled = false,
  conditionalAuthoringEnabled = false,
  testModeEnabled = false,
  safeToPublishEnabled = false,
  threePaneEnabled = false,
  model,
}: TabbedShellProps & {
  /**
   * ED3 (spec 19ae, Task 6) — the composed editor model (document model +
   * save flow, publish/duplicate actions, and question-selection state),
   * built ONCE by TemplateEditorController via `useTemplateEditorModel()`.
   * NOT part of the public `TabbedShellProps` (the edit page never passes
   * it); TabbedShell destructures the fields it needs and forwards
   * `model.selection` to `QuestionsTab`.
   */
  model: TemplateEditorModel;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isPublished = version.publishedAt !== null;

  // ─── Tab selection ────────────────────────────────────────────────────
  // Wave ED4 — when the three-pane workspace is on, the Questions ("Edit") tab
  // becomes the param-less default (instead of Metadata). Flag OFF ⇒ default
  // stays "metadata", so the ?tab= routing is byte-identical to today.
  const defaultTab: TabId = threePaneEnabled ? "questions" : "metadata";
  const tabFromUrl = resolveTabFromUrl(searchParams.get("tab"), defaultTab);
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl);

  // Re-sync if the URL param changes externally (e.g. browser nav).
  useEffect(() => {
    const next = resolveTabFromUrl(searchParams.get("tab"), defaultTab);
    // Intentional external-store sync: mirror the ?tab= URL param into local
    // tab state on external navigation (pre-ED3 behavior, byte-identical —
    // pinned by the guard's tab-routing test). Not derivable purely in render
    // because handleTabChange also drives activeTab on user clicks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab((prev) => (prev === next ? prev : next));
  }, [searchParams, defaultTab]);

  const handleTabChange = useCallback(
    (next: string) => {
      if (!(VALID_TAB_IDS as string[]).includes(next)) return;
      setActiveTab(next as TabId);
      const params = new URLSearchParams(searchParams.toString());
      // The default tab is represented by the ABSENCE of ?tab= (so the URL and
      // the tab stay bijective). Flag OFF ⇒ defaultTab is "metadata" — the
      // pre-ED4 behavior, byte-identical.
      if (next === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams, defaultTab],
  );

  // ─── Document model + save flow (ED3 Task 4; composed via Task 6's
  // `useTemplateEditorModel` — TemplateEditorController calls the hooks,
  // TabbedShell just destructures the resulting `model`) ─────────────────
  const {
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
    rawQuestions,
    rawSections,
    scoringConfig,
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
    handleSaveDraft,
  } = model;

  // ─── Save Draft ───────────────────────────────────────────────────────
  // Wave ED1 (spec 19ac) — Test Mode drawer: drafts only, flag-gated.
  const [testModeOpen, setTestModeOpen] = useState(false);
  const testModeAvailable = !isPublished && testModeEnabled;
  const safeToPublishAvailable = !isPublished && safeToPublishEnabled;
  // Stable identities for the Safe-to-Publish badge (Wave ED2) so its readiness
  // useMemo actually caches — recompute only when the draft's structure/dirty
  // state changes, not on every unrelated editor render (adversarial-review fix:
  // a fresh `new Set(...)`/`{...}` per render defeated the child memo).
  const badgePublishedKeys = useMemo(
    () => new Set(publishedQuestionKeys),
    [publishedQuestionKeys],
  );
  const badgeDirty = useMemo(
    () => ({
      questions: Boolean(dirtyFlags.questions),
      sections: Boolean(dirtyFlags.sections),
    }),
    [dirtyFlags.questions, dirtyFlags.sections],
  );

  // ─── Version lifecycle actions (publish/duplicate) — ED3 T5 hook,
  // composed into `model` by Task 6's `useTemplateEditorModel` ───────────
  const {
    publishingVersionId,
    duplicatingVersionId,
    publishing,
    publishIssues,
    setPublishIssues,
    handlePublishVersion,
    handlePublish,
    handleDuplicateVersion,
  } = model;

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
          {safeToPublishAvailable && (
            <SafeToPublishBadge
              questions={questions}
              sections={sections}
              rawQuestions={rawQuestions}
              rawSections={rawSections}
              scoringConfig={scoringConfig}
              publishedKeys={badgePublishedKeys}
              publishedOptionKeys={publishedOptionKeys}
              dirty={badgeDirty}
              isDirty={isAnyDirty}
            />
          )}
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
            {threePaneEnabled ? "Edit" : TAB_LABELS.questions}
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
            {/* Wave ED4 (spec 19af §3.2) — the ONE conditional: the Questions
                authoring body swaps to the three-pane workspace when the flag
                is on. Everything else (header, tab-nav, other surfaces,
                modals, action wiring) stays single-source. Flag OFF renders
                the legacy QuestionsTab byte-identically to today. */}
            {threePaneEnabled ? (
              <ThreePaneWorkspace
                model={model}
                isReadOnly={isPublished}
                isUnlocked={questionEditorUnlocked}
                findingsEnabled={findingsEnabled}
                conditionalEnabled={conditionalAuthoringEnabled}
                publishedOptionKeys={publishedOptionKeys}
              />
            ) : (
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
                selectedSectionStableKey={
                  model.selection.selectedSectionStableKey
                }
                setSelectedSectionStableKey={
                  model.selection.setSelectedSectionStableKey
                }
                focusedQuestionUid={model.selection.focusedQuestionUid}
                setFocusedQuestionUid={model.selection.setFocusedQuestionUid}
                resetSelection={model.selection.resetSelection}
              />
            )}
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

      {testModeAvailable && testModeOpen && (
        <TestModeDrawer
          open
          onClose={() => setTestModeOpen(false)}
          templateAlias={template.alias}
          questions={questions}
          sections={sections}
          rawQuestions={rawQuestions}
          rawSections={rawSections}
          scoringConfig={scoringConfig}
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
