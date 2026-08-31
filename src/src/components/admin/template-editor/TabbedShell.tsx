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
import type { AssessmentTemplateDeliveryType } from "@prisma/client";
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
import { SingleColumnFormBuilder } from "@/components/admin/template-editor/SingleColumnFormBuilder";
import { FormsBuilder } from "@/components/admin/template-editor/FormsBuilder";
import { PreviewTab } from "@/components/admin/template-editor/PreviewTab";
import { ReportsTab } from "@/components/admin/template-editor/ReportsTab";
import { SettingsTab } from "@/components/admin/template-editor/SettingsTab";
import type { PeerBenchmarkRow } from "@/components/assessments/PeerBenchmarksPanel";
import type { TemplateEditorModel } from "@/components/admin/template-editor/hooks/useTemplateEditorModel";
import { TestModeDrawer } from "@/components/admin/template-editor/TestModeDrawer";
import { SafeToPublishBadge } from "@/components/admin/template-editor/SafeToPublishBadge";
import {
  ScoringTiersTab,
  type ScoringConfigShape,
} from "@/components/admin/template-editor/ScoringTiersTab";
import { VersionsTab } from "@/components/admin/template-editor/VersionsTab";
import { deriveVersionStatuses } from "@/components/admin/template-editor/version-lifecycle";
import {
  buildSectionDeletePrompt,
  collectSectionDeleteImpact,
} from "@/components/admin/template-editor/question-commands";
import {
  ACCESS_MODE_LABELS,
  AGGREGATION_MODE_LABELS,
} from "@/components/admin/template-editor/enum-labels";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import {
  deriveReportStylePreviewCapabilities,
  type ReportStyleKey,
} from "@/lib/assessments/report-style-registry";
import type { InvitedWelcomeConfig } from "@/lib/assessments/invited-welcome-config";
import { extractMarketingCta } from "@/lib/assessments/marketing-cta";
import {
  extractReportHtml,
  type SafeReportHtml,
} from "@/lib/assessments/report-html";

// ────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────
type TabId =
  | "metadata"
  | "sections"
  | "questions"
  | "scoring"
  | "versions"
  // ED10 (spec 19am-plan, T3) — the Preview + Settings tabs. Valid ids ONLY
  // when ed10Active (see editorTabConfig); the triggers/panels render in T10.
  | "preview"
  | "reports"
  | "settings";

const VALID_TAB_IDS: TabId[] = [
  "metadata",
  "sections",
  "questions",
  "scoring",
  "versions",
];

// ED10 (spec 19am-plan, T3) — valid ids when ed10Active: the Metadata tab folds
// into Settings and a Preview tab leads (Sections stays folded, ED6). Selected
// by editorTabConfig; flag OFF ⇒ VALID_TAB_IDS above, byte-identical to today.
const ED10_VALID_TAB_IDS: TabId[] = [
  "preview",
  "questions",
  "scoring",
  "settings",
  "versions",
];
const ED10_REPORTS_VALID_TAB_IDS: TabId[] = [
  "preview",
  "questions",
  "scoring",
  "reports",
  "settings",
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
  // ED10 (T3) — labels exist so Record<TabId, string> stays total; the
  // triggers that render them are wired in T10 (dark until launch).
  preview: "Preview",
  reports: "Reports",
  settings: "Settings",
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
  /** Admin policy copied into future eligible campaigns. */
  defaultReportStyle?: ReportStyleKey;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
  accessMode?: "INVITED" | "PUBLIC";
  deliveryType?: AssessmentTemplateDeliveryType;
  invitedWelcomeDefault?: InvitedWelcomeConfig;
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
  /** Server-canonical bytes used by the audited Reports-tab preview seam. */
  reportHtmlPreview?: SafeReportHtml;
}

export interface TemplateEditorTabbedVersionMeta {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  /** F5 — Versions tab renders the first 12 chars in the row. */
  contentHash: string;
  /**
   * Wave ED8 (spec 19ak) — ISO string when the version is archived; null/
   * absent otherwise. OPTIONAL (treated as null) so pre-ED8 fixtures stay
   * byte-compatible; the flag-OFF pill/caption/VersionsTab never read it.
   */
  archivedAt?: string | null;
}

export interface DirtyFlags {
  metadata?: boolean;
  welcome?: boolean;
  version?: boolean;
  sections?: boolean;
  questions?: boolean;
  scoringConfig?: boolean;
  reportConfig?: boolean;
}

/**
 * Wave ED10 (spec 19am-plan, Task 5) — the Active PUBLISHED version snapshot
 * that feeds the Preview tab's read-only "Active" mode (Task 6). Built
 * server-side on the edit page ONLY when `isPreviewSettingsEnabled()` and a
 * published version exists (null otherwise). `sections` / `questions` are the
 * stored version JSON (survey-shaped, as the /me route emits it); the Preview
 * tab normalizes them via preview-version-adapter's stored-JSON adapter. `name`
 * is the template name (versions carry no name). Presentation-only.
 */
export interface ActivePreview {
  versionNumber: number;
  publishedAt: string | null;
  language: string;
  name: string;
  sections: unknown;
  questions: unknown;
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
  /**
   * Wave ED6 (spec 19ah, PR-A) — single-column form-builder editor. Server-
   * computed (`isSingleColumnEnabled()`) and passed down from the edit page.
   * WINS over `threePaneEnabled`: true ⇒ the Questions body swaps to
   * `SingleColumnFormBuilder`, the tab is relabeled "Build" and becomes the
   * default landing tab, and the Sections tab is folded in (its trigger +
   * panel disappear; a `?tab=sections` deep-link resolves to the Build tab).
   * Default false ⇒ falls through to the ED4 three-pane / legacy behavior,
   * byte-identical to today.
   */
  singleColumnEnabled?: boolean;
  /**
   * Wave ED9 (spec 19al-plan, Task 11) — Google-Forms Build-tab presentation.
   * Server-computed (`isFormsBuildEnabled()`) and passed down from the edit
   * page. Only meaningful when `singleColumnEnabled` is also on (the ED6
   * single-column mode). True + single ⇒ the Build panel swaps
   * `SingleColumnFormBuilder` → `FormsBuilder` AND the page-header
   * `<h2 class="wf-page-title">` is hidden (the hero card owns the title,
   * decision D1). Default false ⇒ byte-identical to today's ED6 single mode
   * (`SingleColumnFormBuilder` + the `<h2>`). Presentation-only; kill = flag
   * off + redeploy. Three-pane/legacy keep the `<h2>` regardless of the flag.
   */
  formsBuildEnabled?: boolean;
  /**
   * Wave ED8 (spec 19ak §2) — version-lifecycle UI. Server-computed
   * (`isVersionLifecycleEnabled()`) and passed down from the edit page.
   * Default false ⇒ legacy VersionsTab table, MetadataTab Version History
   * strip, and the `v{n} (published|draft)` pill all render byte-identically
   * to today. True ⇒ VersionsTab becomes the lifecycle table (derived
   * Active/Superseded/Draft/Archived statuses + Roll back/Archive/Unarchive/
   * Delete verbs), the Metadata strip is removed, and the pill shows the
   * derived status.
   */
  versionLifecycleEnabled?: boolean;
  /**
   * Wave ED10 (spec 19am-plan) — Metadata→Preview + Settings tab rebuild.
   * Server-computed (`isPreviewSettingsEnabled()`) and passed down from the
   * edit page. Default false ⇒ the editor renders byte-identical to today's
   * ED9 shell (Metadata tab, no Settings tab). Reserved for later ED10 tasks;
   * inert today (accepted + defaulted, not yet read). Presentation-only.
   */
  previewSettingsEnabled?: boolean;
  /** Mobile-responsive presentation gate. Default false preserves editor DOM/classes. */
  mobileResponsiveEnabled?: boolean;
  /**
   * Template-creation simplification — server-computed and forwarded only to
   * the existing Scoring & Tiers tab. Default false preserves legacy copy.
   */
  plainLanguageScoringEnabled?: boolean;
  /** Server-computed availability for the report-style release. */
  reportStylesEnabled?: boolean;
  /** Gates admin-owned Welcome authoring and coach presentation ownership. */
  adminOwnedPresentationEnabled?: boolean;
  /**
   * Wave 48 — QSP core-values stories presentation. Server-computed and
   * forwarded to the read-only Preview pager; default false preserves ED10.
   */
  qspStoryGroupEnabled?: boolean;
  /**
   * Wave ED10 (spec 19am-plan, Task 5) — the Active PUBLISHED version snapshot
   * for the Preview tab's read-only "Active" mode. Built server-side on the
   * edit page ONLY when `isPreviewSettingsEnabled()` (null when the flag is off
   * OR no published version exists). Flows through TemplateEditorController's
   * `{...props}` spread; TabbedShell holds it for the Preview tab (Task 6) —
   * inert until then. Presentation-only.
   */
  activePreview?: ActivePreview | null;
  /** Peer benchmark rows resolved by the server for the Settings editor. */
  peerBenchmarkRows?: PeerBenchmarkRow[] | null;
  /** Gates public/invited classification and the marketing CTA authoring surface. */
  publicMarketingCtaEnabled?: boolean;
  /** Server-resolved composite gate for report HTML authoring and rendering. */
  reportsActive?: boolean;
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
type AuthoringMode = "single" | "three" | "legacy";

/**
 * ED10 (spec 19am-plan, T3) — the valid-id set + param-less default, both
 * DERIVED from ed10Active. Exported (pure) for unit tests.
 *   ed10Active  → { preview, questions, scoring, settings, versions },
 *                 default "preview" (Metadata folds into Settings; Preview
 *                 leads).
 *   otherwise   → today's set (VALID_TAB_IDS) + today's computed default
 *                 ("questions" in a workspace mode, else "metadata") —
 *                 byte-identical to the flag-OFF path. Forcing "metadata" as
 *                 the inactive default here would regress ED9 forms mode (C5).
 */
export function editorTabConfig(
  activeAuthoringMode: AuthoringMode,
  ed10Active: boolean,
  reportsActive = false,
): { defaultTab: TabId; validTabIds: readonly TabId[] } {
  if (ed10Active) {
    return {
      defaultTab: "preview",
      validTabIds: reportsActive
        ? ED10_REPORTS_VALID_TAB_IDS
        : ED10_VALID_TAB_IDS,
    };
  }
  return {
    defaultTab: activeAuthoringMode !== "legacy" ? "questions" : "metadata",
    validTabIds: VALID_TAB_IDS,
  };
}

/**
 * ED10 (spec 19am-plan, T3) — single source of truth for editor tab routing:
 * maps the ?tab= URL param + the two mode signals to a resolved TabId. The
 * component calls this for BOTH the initial tab and the URL-resync effect, so
 * the unit tests exercise the exact production path. Exported (pure).
 *
 * Order matters:
 *   1. ED6 (spec 19ah) — single-column folds the Sections tab into Build, so a
 *      `?tab=sections` deep-link resolves to Build/questions (also holds under
 *      ED10, where the mode is always single). `"questions"` stays valid.
 *   2. ED10 — the Metadata tab is absorbed into Settings, so a stale
 *      `?tab=metadata` resolves to Settings (metadata is NOT in the ED10 valid
 *      set). Fires ONLY when ed10Active; flag OFF ⇒ metadata stays metadata.
 *   3. Any other id in the (ed10Active-derived) valid set passes through.
 *   4. Unknown / param-less ⇒ the (ed10Active-derived) default.
 */
export function resolveEditorTab(
  param: string | null,
  activeAuthoringMode: AuthoringMode,
  ed10Active: boolean,
  reportsActive = false,
): TabId {
  const { defaultTab, validTabIds } = editorTabConfig(
    activeAuthoringMode,
    ed10Active,
    reportsActive,
  );
  if (activeAuthoringMode === "single" && param === "sections") {
    return "questions";
  }
  if (ed10Active && param === "metadata") {
    return "settings";
  }
  if (param && (validTabIds as readonly string[]).includes(param)) {
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
  singleColumnEnabled = false,
  formsBuildEnabled = false,
  versionLifecycleEnabled = false,
  // ED10 (spec 19am-plan): gates the Preview/Settings rebuild. As of Task 2
  // it feeds `ed10Active` (below), which humanizes the header pills; Task 10
  // mounts the Preview + Settings tabs when `ed10Active`.
  previewSettingsEnabled = false,
  mobileResponsiveEnabled = false,
  plainLanguageScoringEnabled = false,
  reportStylesEnabled = false,
  adminOwnedPresentationEnabled = false,
  qspStoryGroupEnabled = false,
  // ED10 (spec 19am-plan, Task 5/10) — Active published-version snapshot for
  // the Preview tab's "Active" side; null when nothing is published (or the
  // flag is off). Threaded into PreviewTab below.
  activePreview = null,
  peerBenchmarkRows = null,
  publicMarketingCtaEnabled = false,
  reportsActive = false,
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

  // ─── Authoring-mode selection (ED4/ED6) ───────────────────────────────
  // The Questions-body presentation is picked by a single derived value:
  //   single  (ED6) — flag WINS; body = SingleColumnFormBuilder, "Build" tab,
  //                    Sections folded in.
  //   three   (ED4) — body = ThreePaneWorkspace, "Edit" tab.
  //   legacy         — body = QuestionsTab, "Questions" tab (byte-identical to
  //                    today; both flags OFF).
  const activeAuthoringMode: AuthoringMode = singleColumnEnabled
    ? "single"
    : threePaneEnabled
      ? "three"
      : "legacy";

  // ─── ED10 gate (spec 19am-plan, T2) ───────────────────────────────────
  // The Preview/Settings rebuild lights up ONLY in the ED9 production shell
  // (single-column + Google-Forms Build) with the ED10 flag on. Task 2 uses
  // it to humanize the header access/aggregation pills; Task 3 reuses it. Any
  // leg false ⇒ raw enums / today's shell, byte-identical to the flag-OFF path.
  const ed10Active =
    previewSettingsEnabled &&
    formsBuildEnabled &&
    activeAuthoringMode === "single";
  const reportStylePreviewCapabilities = useMemo(
    () =>
      deriveReportStylePreviewCapabilities({
        templateAlias: template.alias,
        questions: version.questions,
      }),
    [template.alias, version.questions],
  );

  // ─── Tab selection ────────────────────────────────────────────────────
  // Wave ED4/ED6 — when a workspace mode is on (single or three), the Questions
  // ("Build"/"Edit") tab becomes the param-less default (instead of Metadata).
  // Legacy ⇒ default stays "metadata", so the ?tab= routing is byte-identical
  // to today.
  // ED10 (T3) — the valid-id set + param-less default both derive from
  // ed10Active (via editorTabConfig). Flag OFF ⇒ today's set + today's computed
  // default (Build in a workspace mode, Metadata in legacy), byte-identical.
  const { defaultTab, validTabIds } = editorTabConfig(
    activeAuthoringMode,
    ed10Active,
    reportsActive,
  );
  const tabFromUrl = resolveEditorTab(
    searchParams.get("tab"),
    activeAuthoringMode,
    ed10Active,
    reportsActive,
  );
  const [activeTab, setActiveTab] = useState<TabId>(tabFromUrl);

  // Re-sync if the URL param changes externally (e.g. browser nav).
  useEffect(() => {
    const next = resolveEditorTab(
      searchParams.get("tab"),
      activeAuthoringMode,
      ed10Active,
      reportsActive,
    );
    // Intentional external-store sync: mirror the ?tab= URL param into local
    // tab state on external navigation (pre-ED3 behavior, byte-identical —
    // pinned by the guard's tab-routing test). Not derivable purely in render
    // because handleTabChange also drives activeTab on user clicks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab((prev) => (prev === next ? prev : next));
  }, [searchParams, activeAuthoringMode, ed10Active, reportsActive]);

  const handleTabChange = useCallback(
    (next: string) => {
      if (!(validTabIds as readonly string[]).includes(next)) return;
      setActiveTab(next as TabId);
      const params = new URLSearchParams(searchParams.toString());
      // The default tab is represented by the ABSENCE of ?tab= (so the URL and
      // the tab stay bijective). Flag OFF ⇒ defaultTab is "metadata" (legacy)
      // or "questions" (workspace mode) — the pre-ED10 behavior, byte-identical.
      if (next === defaultTab) {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams, defaultTab, validTabIds],
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
    reportConfig,
    handleScoringConfigChange,
    handleMarketingCtaChange,
    handleReportHtmlChange,
    handleTemplateFieldChange,
    handleVersionFieldChange,
    handleSendResultsDefaultChange,
    // ED10 (spec 19am-plan, Task 7/10) — per-card template-row Save + its
    // in-flight/error state, consumed by the Settings tab (Task 8).
    handleTemplateRowSave,
    templateRowSaving,
    templateRowError,
    handleSectionsAdd,
    handleSectionsRename,
    handleSectionsMoveUp,
    handleSectionsMoveDown,
    handleSectionsReorder,
    deleteSection,
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

  // ED5 T15 (B-2b, global) — the Sections tab now deletes through the SAME
  // cascade `deleteSection` command the three-pane outline uses (no orphaning).
  // The confirm is assembled HERE (the caller has the full questions list) via
  // the shared `collectSectionDeleteImpact` + `buildSectionDeletePrompt`, so the
  // two surfaces prompt identically (co-validate C2). SectionsCard no longer
  // runs its own confirm.
  const handleSectionsCascadeDelete = useCallback(
    (uid: string) => {
      const section = sections.find((s) => s.uid === uid);
      if (!section) return;
      const impact = collectSectionDeleteImpact(
        sections,
        questions as QuestionDraftRow[],
        uid,
      );
      const ok = window.confirm(
        buildSectionDeletePrompt(
          { name: section.name, stableKey: section.stableKey },
          {
            questionCount: impact.questionCount,
            inheritedKeys: impact.inheritedKeys,
            freedDependentKeys: impact.freedDependentKeys,
            isUnlocked: questionEditorUnlocked,
          },
        ),
      );
      if (ok) deleteSection(uid);
    },
    [sections, questions, questionEditorUnlocked, deleteSection],
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
    // Wave ED8 (spec 19ak) — lifecycle actions (T6 hook, spread into model).
    archivingVersionId,
    unarchivingVersionId,
    deletingVersionId,
    handleArchiveVersion,
    handleUnarchiveVersion,
    handleDeleteVersion,
  } = model;

  // ─── Versions caption ─────────────────────────────────────────────────
  const publishedSibling = useMemo(
    () =>
      allVersions.find(
        (v) =>
          v.publishedAt !== null &&
          v.id !== version.id &&
          // Wave ED8 (spec 19ak §2) — UNCONDITIONAL correctness fix: the
          // "Published vN active since …" caption must come from the SAME
          // language as the open version (Active is per-language). A no-op
          // for single-language templates (all frozen-guard fixtures).
          v.language === version.language &&
          // Flag ON — an archived sibling is retired; never caption it.
          (!versionLifecycleEnabled || (v.archivedAt ?? null) === null),
      ),
    [allVersions, version.id, version.language, versionLifecycleEnabled],
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

  // ─── Header pill wording (Wave ED8, spec 19ak §2) ─────────────────────
  // Flag OFF ⇒ the EXACT legacy `v{n} (published|draft)` wording + classes.
  // Flag ON ⇒ the open version's DERIVED lifecycle status within allVersions
  // (active / superseded / draft / archived); draft keeps the draft pill
  // style, all published statuses keep the published style (no new tokens).
  const pillStatusWord = useMemo(() => {
    const legacyWord = isPublished ? "published" : "draft";
    if (!versionLifecycleEnabled) return legacyWord;
    const statuses = deriveVersionStatuses(
      allVersions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        language: v.language,
        publishedAt: v.publishedAt,
        archivedAt: v.archivedAt ?? null,
      })),
    );
    // The open version is always in allVersions; fall back to the legacy
    // wording defensively if a fixture ever omits it.
    return statuses.get(version.id) ?? legacyWord;
  }, [versionLifecycleEnabled, allVersions, version.id, isPublished]);

  return (
    <div
      className={
        mobileResponsiveEnabled
          ? "template-editor-responsive min-w-0 max-w-full space-y-6"
          : "space-y-6"
      }
      {...(mobileResponsiveEnabled ? { "data-responsive-editor": "" } : {})}
    >
      {/* ───────── Header (WF16/17/18 page-header-row) ───────── */}
      <header
        className={
          mobileResponsiveEnabled
            ? "wf-page-header-row min-w-0 flex-col sm:flex-row"
            : "wf-page-header-row"
        }
      >
        <div
          className={
            mobileResponsiveEnabled
              ? "wf-page-title-block min-w-0 max-w-full break-words"
              : "wf-page-title-block"
          }
        >
          {/* Wave ED9 (spec 19al-plan, T11, D1) — hide the page-header title
              EXACTLY when the Google-Forms Build body is active (flag ON +
              single mode); the FormHeaderCard hero owns the title there. Must
              be flag-gated like this — keying off `activeAuthoringMode ===
              "single"` alone would strip the h2 from today's flag-OFF ED6
              single mode and break the goldens + byte-identity. Three-pane/
              legacy always keep the h2. */}
          {!(formsBuildEnabled && activeAuthoringMode === "single") && (
            <h2 className="wf-page-title">{template.name}</h2>
          )}
          <div className="wf-page-pill-row">
            <span
              data-testid="template-editor-version-pill"
              className={
                pillStatusWord === "draft"
                  ? "wf-version-pill-draft"
                  : "wf-version-pill-published"
              }
            >
              v{version.versionNumber} ({pillStatusWord})
            </span>
            <span className="wf-pill wf-pill-access-invited">
              {ed10Active
                ? (ACCESS_MODE_LABELS[template.accessMode ?? "INVITED"] ??
                  (template.accessMode ?? "INVITED"))
                : (template.accessMode ?? "INVITED")}
            </span>
            <span className="wf-pill wf-pill-agg-full">
              {ed10Active
                ? (AGGREGATION_MODE_LABELS[template.aggregationMode] ??
                  template.aggregationMode)
                : template.aggregationMode}
            </span>
            <span style={{ fontStyle: "italic" }}>{caption}</span>
          </div>
        </div>

        <div
          className={
            mobileResponsiveEnabled
              ? "wf-page-action-row min-w-0 w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center"
              : "wf-page-action-row"
          }
          {...(mobileResponsiveEnabled
            ? { "data-testid": "template-editor-actions" }
            : {})}
        >
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
              responsiveEnabled={mobileResponsiveEnabled}
            />
          )}
          {testModeAvailable && (
            <button
              type="button"
              onClick={() => setTestModeOpen(true)}
              className={
                mobileResponsiveEnabled
                  ? "wf-btn wf-btn-secondary wf-btn-sm min-h-11 min-w-11"
                  : "wf-btn wf-btn-secondary wf-btn-sm"
              }
              data-testid="template-editor-test-mode-btn"
            >
              Test Mode
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isPublished || savingDraft || !isAnyDirty}
            className={
              mobileResponsiveEnabled
                ? "wf-btn wf-btn-secondary wf-btn-sm min-h-11 min-w-11"
                : "wf-btn wf-btn-secondary wf-btn-sm"
            }
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
            className={
              mobileResponsiveEnabled
                ? "wf-btn wf-btn-primary wf-btn-sm min-h-11 min-w-11"
                : "wf-btn wf-btn-primary wf-btn-sm"
            }
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
        <TabsList
          className={
            mobileResponsiveEnabled
              ? "mb-6 min-w-0 max-w-full w-full overflow-x-auto"
              : "mb-6"
          }
          {...(mobileResponsiveEnabled
            ? {
                "aria-label": "Template editor tabs",
                "data-responsive-tabs": "",
              }
            : {})}
        >
          {/* ED10 (spec 19am-plan, T10) — Metadata folds into Settings and a
              Preview tab leads. Flag OFF ⇒ the Metadata trigger renders EXACTLY
              as today (byte-identical). */}
          {ed10Active ? (
            <TabsTrigger
              value="preview"
              {...(mobileResponsiveEnabled
                ? { className: "min-h-11 min-w-11" }
                : {})}
            >
              {TAB_LABELS.preview}
            </TabsTrigger>
          ) : (
            <TabsTrigger
              value="metadata"
              {...(mobileResponsiveEnabled
                ? { className: "min-h-11 min-w-11" }
                : {})}
            >
              {TAB_LABELS.metadata}
            </TabsTrigger>
          )}
          {/* ED6 — single-column folds Sections into the Build tab, so its
              trigger disappears in single mode. Three/legacy render it. */}
          {activeAuthoringMode !== "single" && (
            <TabsTrigger
              value="sections"
              {...(mobileResponsiveEnabled
                ? { className: "min-h-11 min-w-11" }
                : {})}
            >
              {TAB_LABELS.sections}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="questions"
            {...(mobileResponsiveEnabled
              ? { className: "min-h-11 min-w-11" }
              : {})}
          >
            {activeAuthoringMode === "single"
              ? "Build"
              : activeAuthoringMode === "three"
                ? "Edit"
                : TAB_LABELS.questions}
          </TabsTrigger>
          <TabsTrigger
            value="scoring"
            {...(mobileResponsiveEnabled
              ? { className: "min-h-11 min-w-11" }
              : {})}
          >
            {TAB_LABELS.scoring}
          </TabsTrigger>
          {ed10Active && reportsActive && (
            <TabsTrigger
              value="reports"
              {...(mobileResponsiveEnabled
                ? { className: "min-h-11 min-w-11" }
                : {})}
            >
              {TAB_LABELS.reports}
            </TabsTrigger>
          )}
          {/* ED10 (spec 19am-plan, T10) — the Settings tab takes the Access
              slot when active; Access management moves inside Settings
              (the AccessGroupsRow "Manage" link). Flag OFF ⇒ the Access
              <Link> renders EXACTLY as today (byte-identical).

              Access — link, not a tab panel. Per WF16 spec it navigates
              to /admin/assessments/access-groups. We render it inside the
              tab nav so it sits in the same visual row, but as a Radix
              tab trigger that doesn't have a panel. To keep keyboard
              semantics correct we mark it as a tab but override its
              click to navigate instead of switching panels. */}
          {ed10Active ? (
            <TabsTrigger
              value="settings"
              {...(mobileResponsiveEnabled
                ? { className: "min-h-11 min-w-11" }
                : {})}
            >
              {TAB_LABELS.settings}
            </TabsTrigger>
          ) : (
            <Link
              href="/admin/assessments/access-groups"
              role="tab"
              aria-selected="false"
              data-testid="template-editor-access-link"
              className={
                mobileResponsiveEnabled
                  ? "inline-flex min-h-11 min-w-11 items-center gap-1.5 whitespace-nowrap px-0.5 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground"
                  : "inline-flex items-center gap-1.5 whitespace-nowrap px-0.5 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground"
              }
            >
              Access
            </Link>
          )}
          <TabsTrigger
            value="versions"
            {...(mobileResponsiveEnabled
              ? { className: "min-h-11 min-w-11" }
              : {})}
          >
            {TAB_LABELS.versions}
          </TabsTrigger>
        </TabsList>

        {/* ED10 (spec 19am-plan, T10) — Preview tab (read-only respondent
            render). Mounted ONLY when ed10Active; T3 routing makes it the
            param-less default, in place of the Metadata panel below. */}
        {ed10Active && (
          <TabsContent value="preview">
            <div data-testid="tab-panel-preview">
              <PreviewTab
                sections={sections}
                questions={questions as QuestionDraftRow[]}
                version={{
                  versionNumber: version.versionNumber,
                  language: versionValues.language,
                }}
                template={{ name: template.name, alias: template.alias }}
                activePreview={activePreview}
                qspStoryGroupEnabled={qspStoryGroupEnabled}
              />
            </div>
          </TabsContent>
        )}
        {/* F2 — Metadata tab (WF16). ED10 (T10) — the Metadata panel renders
            ONLY when NOT ed10Active (byte-identical to today when off). */}
        {!ed10Active && (
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
              onSectionsDelete={handleSectionsCascadeDelete}
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
              versionLifecycleEnabled={versionLifecycleEnabled}
            />
          </div>
        </TabsContent>
        )}
        {/* F2b — Sections tab (standalone, full-width). ED6 — folded into the
            single-column Build tab, so its panel is not mounted in single
            mode (its trigger is also gone). */}
        {activeAuthoringMode !== "single" && (
          <TabsContent value="sections">
            <div data-testid="tab-panel-sections">
              <SectionsTab
                sections={sections}
                questionCountByStableKey={questionCountByStableKey}
                onSectionsAdd={handleSectionsAdd}
                onSectionsRename={handleSectionsRename}
                onSectionsDelete={handleSectionsCascadeDelete}
                onSectionsMoveUp={handleSectionsMoveUp}
                onSectionsMoveDown={handleSectionsMoveDown}
                onSectionsReorder={handleSectionsReorder}
                isReadOnly={isPublished}
              />
            </div>
          </TabsContent>
        )}
        <TabsContent value="questions">
          <div data-testid="tab-panel-questions">
            {/* Wave ED4 (spec 19af §3.2) / ED6 (spec 19ah PR-A) — the ONE
                conditional: the Questions authoring body swaps by mode.
                single (ED6, WINS) ⇒ SingleColumnFormBuilder;
                three  (ED4)       ⇒ ThreePaneWorkspace;
                legacy (both OFF)  ⇒ QuestionsTab (byte-identical to today).
                Everything else (header, tab-nav, other surfaces, modals,
                action wiring) stays single-source. */}
            {activeAuthoringMode === "single" ? (
              // Wave ED9 (spec 19al-plan, T11) — flag ON swaps the ED6
              // single-column builder for the Google-Forms `FormsBuilder`
              // (same prop shape). Flag OFF ⇒ byte-identical ED6 body.
              formsBuildEnabled ? (
                <FormsBuilder
                  model={model}
                  isReadOnly={isPublished}
                  isUnlocked={questionEditorUnlocked}
                  findingsEnabled={findingsEnabled}
                  conditionalEnabled={conditionalAuthoringEnabled}
                  publishedOptionKeys={publishedOptionKeys}
                  onGoToSections={() => handleTabChange("sections")}
                  adminOwnedPresentationEnabled={adminOwnedPresentationEnabled}
                  responsiveEnabled={mobileResponsiveEnabled}
                />
              ) : (
                <SingleColumnFormBuilder
                  model={model}
                  isReadOnly={isPublished}
                  isUnlocked={questionEditorUnlocked}
                  findingsEnabled={findingsEnabled}
                  conditionalEnabled={conditionalAuthoringEnabled}
                  publishedOptionKeys={publishedOptionKeys}
                  onGoToSections={() => handleTabChange("sections")}
                  responsiveEnabled={mobileResponsiveEnabled}
                />
              )
            ) : threePaneEnabled ? (
              <ThreePaneWorkspace
                model={model}
                isReadOnly={isPublished}
                isUnlocked={questionEditorUnlocked}
                findingsEnabled={findingsEnabled}
                conditionalEnabled={conditionalAuthoringEnabled}
                publishedOptionKeys={publishedOptionKeys}
                onGoToSections={() => handleTabChange("sections")}
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
              plainLanguageEnabled={plainLanguageScoringEnabled}
              onScoringConfigChange={(next) =>
                handleScoringConfigChange(next as Record<string, unknown>)
              }
            />
          </div>
        </TabsContent>
        {ed10Active && reportsActive && (
          <TabsContent value="reports">
            <div data-testid="tab-panel-reports">
              <ReportsTab
                value={extractReportHtml(reportConfig)}
                previewHref={`/admin/assessments/templates/${template.id}/versions/${version.id}/preview-report`}
                historicalPreviewHref={template.alias === "scaling-up-full" ? `/admin/assessments/templates/${template.id}/versions/${version.id}/preview-report?peerReference=historical` : null}
                previewDisabled={Boolean(dirtyFlags.reportConfig)}
                onChange={handleReportHtmlChange}
                isReadOnly={isPublished}
              />
            </div>
          </TabsContent>
        )}
        {/* ED10 (spec 19am-plan, T10) — Settings tab (the Metadata field wall
            rebuilt as one plain-language column). Mounted ONLY when ed10Active;
            it takes the Access slot in the bar. No onSections* threading — the
            Settings tab has no Sections card (D6). */}
        {ed10Active && (
          <TabsContent value="settings">
            <div data-testid="tab-panel-settings">
              <SettingsTab
                templateId={template.id}
                versionId={version.id}
                templateValues={templateValues}
                language={versionValues.language}
                isReadOnly={isPublished}
                onTemplateFieldChange={handleTemplateFieldChange}
                onVersionFieldChange={handleVersionFieldChange}
                handleTemplateRowSave={handleTemplateRowSave}
                templateRowSaving={templateRowSaving}
                templateRowError={templateRowError}
                sendResultsDefault={sendResultsDefault}
                onSendResultsDefaultChange={handleSendResultsDefaultChange}
                savingSendResultsDefault={savingSendResultsDefault}
                waveQEnabled={waveQEnabled}
                reportStylesEnabled={reportStylesEnabled}
                reportStylePreviewCapabilities={reportStylePreviewCapabilities}
                peerBenchmarkRows={peerBenchmarkRows}
                deliveryType={templateValues.deliveryType}
                hasPublishedVersion={allVersions.some(
                  (candidate) => candidate.publishedAt !== null,
                )}
                publicMarketingCtaEnabled={publicMarketingCtaEnabled}
                marketingCta={extractMarketingCta(reportConfig)}
                onMarketingCtaChange={handleMarketingCtaChange}
                marketingCtaDirty={Boolean(dirtyFlags.reportConfig)}
                reportsActive={reportsActive}
              />
            </div>
          </TabsContent>
        )}
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
                // Wave ED8 — lifecycle status input; null-normalized so the
                // derivation helper sees a complete row.
                archivedAt: v.archivedAt ?? null,
              }))}
              publishingVersionId={publishingVersionId}
              duplicatingVersionId={duplicatingVersionId}
              onPublish={handlePublishVersion}
              onDuplicate={handleDuplicateVersion}
              versionLifecycleEnabled={versionLifecycleEnabled}
              archivingVersionId={archivingVersionId}
              unarchivingVersionId={unarchivingVersionId}
              deletingVersionId={deletingVersionId}
              onArchive={handleArchiveVersion}
              onUnarchive={handleUnarchiveVersion}
              onDelete={handleDeleteVersion}
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
