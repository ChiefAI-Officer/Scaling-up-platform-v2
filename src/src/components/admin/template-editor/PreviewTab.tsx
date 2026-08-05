"use client";

/**
 * Wave ED10 (spec 19am-plan, Task 6) — the template-editor Preview tab (D1/D2/D4).
 *
 * A read-only, respondent's-eye render of the questionnaire. It reuses the EXACT
 * survey pipeline — the Task-5 `assembleSurveyPages` helper + the LIVE
 * `SectionPager` in its additive `previewMode` (Task 4) — so what the author
 * sees here is byte-identical to what an invited respondent sees, with every
 * control frozen (`disabled`, never `inert`, so the content stays readable) and
 * nothing submittable.
 *
 * Two sources, one facts strip toggle:
 *   - ACTIVE — the Active published version snapshot (`activePreview`, built
 *     server-side in Task 5). Read via the stored-JSON adapter. Default side
 *     when a published version exists.
 *   - THIS DRAFT — the live in-editor model (`sections` / `questions`), so an
 *     unsaved edit shows immediately. Read via the draft adapter (mirrors the
 *     save serializers, so the draft preview matches what a publish would emit).
 *   When nothing is published, there is no Active side: the strip shows a single
 *     DRAFT label and no toggle.
 *
 * The facts line describes the SELECTED side only (`{n} questions in {m}
 * sections` + language). It deliberately does NOT restate access/aggregation —
 * those live in the header pills (T2) and the Settings tab.
 *
 * Presentation-only. No schema / API / persistence. Standalone until Task 10
 * mounts it into the shell.
 */

import React from "react";

import { assembleSurveyPages } from "@/lib/assessments/assemble-survey-pages";
import { SectionPager } from "@/components/assessments/section-pager";
import { LANGUAGE_LABELS } from "@/components/admin/template-editor/enum-labels";
import {
  draftSectionsToPager,
  draftQuestionsToPager,
  storedSectionsToPager,
  storedQuestionsToPager,
} from "@/components/admin/template-editor/preview-version-adapter";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { ActivePreview } from "@/components/admin/template-editor/TabbedShell";
import type {
  PagerSection,
  PagerQuestion,
} from "@/lib/assessments/section-pages";

// ────────────────────────────────────────────────────────────────────────
// Props — a narrow set TabbedShell (Task 10) can pass from what it holds:
// the live draft arrays, the open version's number/language, the template
// identity, and the Active snapshot (null when nothing is published).
// ────────────────────────────────────────────────────────────────────────
export interface PreviewTabProps {
  /** Live draft sections (the in-editor model — reflects unsaved edits). */
  sections: SectionDraft[];
  /** Live draft questions (the in-editor model — reflects unsaved edits). */
  questions: QuestionDraftRow[];
  /** The open version's number + language (drives the draft side facts + label). */
  version: { versionNumber: number; language: string };
  /**
   * Template identity: `name` labels the branded shell header; `alias` drives
   * the assembly audience policy (SU-Full CEO-section gating / LVA visibility).
   */
  template: { name: string; alias: string | null };
  /** The Active published version snapshot; null when nothing is published. */
  activePreview: ActivePreview | null;
  /** Server-resolved QSP core-values story-group presentation gate. */
  qspStoryGroupEnabled?: boolean;
}

type Side = "active" | "draft";

function countLabel(questionCount: number, sectionCount: number): string {
  const q = `${questionCount} ${questionCount === 1 ? "question" : "questions"}`;
  const s = `${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`;
  return `${q} in ${s}`;
}

export function PreviewTab({
  sections,
  questions,
  version,
  template,
  activePreview,
  qspStoryGroupEnabled = false,
}: PreviewTabProps) {
  const hasActive = activePreview !== null;

  // Default to Active when a published version exists (D2); otherwise the draft
  // is the only side. `useState` seeds once; the toggle below is the only mover.
  const [side, setSide] = React.useState<Side>(hasActive ? "active" : "draft");
  // Defensive: never resolve to "active" without a snapshot (guards a
  // no-published mount where `side` could only ever be "draft" anyway).
  const effectiveSide: Side = hasActive ? side : "draft";

  // Adapt the SELECTED side onto the pager shapes. Draft → the serializer-
  // mirroring adapter; Active → the tolerant stored-JSON adapter.
  const secs: PagerSection[] =
    effectiveSide === "active" && activePreview
      ? storedSectionsToPager(activePreview.sections)
      : draftSectionsToPager(sections);
  const qs: PagerQuestion[] =
    effectiveSide === "active" && activePreview
      ? storedQuestionsToPager(activePreview.questions)
      : draftQuestionsToPager(questions);

  const language =
    effectiveSide === "active" && activePreview
      ? activePreview.language
      : version.language;
  const languageLabel = LANGUAGE_LABELS[language] ?? language;

  // Assemble exactly as the live INVITED survey would (answers `{}` = static,
  // isCEO false = preview as a plain respondent). Read `.pages`.
  const { pages } = assembleSurveyPages(secs, qs, {
    answers: {},
    templateAlias: template.alias,
    isCEO: false,
  });

  return (
    <div className="space-y-6">
      {/* ───────────────────── Facts strip ───────────────────── */}
      <section className="wf-card" style={{ padding: "1.25rem" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasActive && activePreview ? (
            <div
              className="inline-flex rounded-md border border-border overflow-hidden"
              role="group"
              aria-label="Preview which version"
            >
              <button
                type="button"
                aria-pressed={effectiveSide === "active"}
                onClick={() => setSide("active")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  effectiveSide === "active"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-muted"
                }`}
              >
                Active · v{activePreview.versionNumber}
              </button>
              <button
                type="button"
                aria-pressed={effectiveSide === "draft"}
                onClick={() => setSide("draft")}
                className={`px-3 py-1.5 text-xs font-medium border-l border-border ${
                  effectiveSide === "draft"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-muted"
                }`}
              >
                This draft · v{version.versionNumber}
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[0.625rem] font-bold uppercase tracking-wider bg-warning/20 text-warning">
              DRAFT · v{version.versionNumber}
            </span>
          )}

          {/* Facts for the SELECTED side only. No access/aggregation restatement. */}
          <p className="text-xs text-muted-foreground">
            {countLabel(qs.length, secs.length)} · {languageLabel}
          </p>
        </div>

        <p className="text-[0.6875rem] text-muted-foreground mt-2">
          Read-only — exactly what respondents see. Nothing is saved. Use Test
          Mode to answer &amp; score a draft.
        </p>
      </section>

      {/* ───────────────────── Read-only render ─────────────────────
          The audience/visibility policy is already applied by
          `assembleSurveyPages` above (templateAlias + isCEO:false). We do NOT
          pass `isCEO`: it remains false/omitted, so the SU-Full CEO tile cannot
          fire. `templateAlias` is passed for the QSP presentation adapter.
          previewMode freezes every control + disables Submit. */}
      <SectionPager
        previewMode
        pages={pages}
        answers={{}}
        onAnswerChange={() => {}}
        onSubmit={() => {}}
        assessmentName={template.name}
        templateAlias={template.alias ?? undefined}
        qspStoryGroupEnabled={qspStoryGroupEnabled}
      />
    </div>
  );
}
