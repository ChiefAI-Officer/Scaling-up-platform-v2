/**
 * Wave ED10 (spec 19am-plan, Task 6) — PreviewTab.
 *
 * The Preview tab renders the SAME `SectionPager` the live INVITED survey uses,
 * fed by the SAME `assembleSurveyPages` pipeline (via the Task-5 adapters), in
 * read-only `previewMode`. A facts strip toggles between the Active published
 * version and the live draft (the in-editor model, unsaved edits included).
 *
 * These tests exercise the component in isolation (Task 10 mounts it in the
 * shell). They assert:
 *   1. Default side = Active when a published version exists; the toggle
 *      switches the rendered source (Active questions ↔ draft questions) AND
 *      the facts line (per-side counts + language).
 *   2. The draft render reflects an unsaved edit (a changed draft array).
 *   3. No published version ⇒ draft-only, a DRAFT label, and NO toggle.
 *   4. The render is read-only: a question control is `disabled` while its
 *      `<label>` text stays in the DOM (previewMode freezes via `disabled`,
 *      not `inert`, so the content is readable). Read-only note cross-links
 *      Test Mode.
 *   5. An empty draft (no sections/questions) ⇒ SectionPager's graceful
 *      "Nothing to answer yet." empty state with Submit disabled.
 */
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PreviewTab } from "@/components/admin/template-editor/PreviewTab";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { ActivePreview } from "@/components/admin/template-editor/TabbedShell";

afterEach(() => cleanup());

// ── Fixtures ────────────────────────────────────────────────────────────────

function sectionDraft(
  over: Partial<SectionDraft> & { stableKey: string },
): SectionDraft {
  return { uid: `u_${over.stableKey}`, name: over.stableKey, ...over };
}

function questionDraft(
  over: Partial<QuestionDraftRow> & { stableKey: string; type: string },
): QuestionDraftRow {
  return {
    uid: `u_${over.stableKey}`,
    sectionStableKey: "S1",
    label: over.stableKey,
    helpText: "",
    isRequired: false,
    sortOrder: 0,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: false,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...over,
  };
}

const TEMPLATE = { name: "Demo Template", alias: "demo" };

/**
 * Active published snapshot: 1 section, 1 TEXT question labelled
 * "ACTIVE_ONLY_Q", language enUS. Stored-JSON shape (what the /me route emits).
 */
function activePreview(over: Partial<ActivePreview> = {}): ActivePreview {
  return {
    versionNumber: 3,
    publishedAt: "2026-07-01T00:00:00.000Z",
    language: "enUS",
    name: "Demo Template",
    sections: [{ stableKey: "S1", sortOrder: 1, name: "Active Section" }],
    questions: [
      {
        stableKey: "aq_text",
        sortOrder: 1,
        sectionStableKey: "S1",
        type: "TEXT",
        label: "ACTIVE_ONLY_Q",
        isRequired: false,
      },
    ],
    ...over,
  };
}

/** Draft: 1 section, 2 TEXT questions, esES — distinct from the Active side. */
const DRAFT_SECTIONS: SectionDraft[] = [
  sectionDraft({ stableKey: "S1", name: "Draft Section" }),
];
const DRAFT_QUESTIONS: QuestionDraftRow[] = [
  questionDraft({ stableKey: "dq1", type: "TEXT", label: "DRAFT_ONLY_Q1", sortOrder: 1 }),
  questionDraft({ stableKey: "dq2", type: "TEXT", label: "DRAFT_ONLY_Q2", sortOrder: 2 }),
];
const DRAFT_VERSION = { versionNumber: 4, language: "esES" };

// ── 1. Toggle switches the rendered source + facts ────────────────────────────

describe("PreviewTab — version toggle", () => {
  it("defaults to Active, then the toggle switches source (Active ↔ draft) and facts", () => {
    render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={DRAFT_QUESTIONS}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={activePreview()}
      />,
    );

    // Default = Active: the Active question shows, the draft questions do not.
    expect(screen.getByText("ACTIVE_ONLY_Q")).toBeInTheDocument();
    expect(screen.queryByText("DRAFT_ONLY_Q1")).not.toBeInTheDocument();
    // Facts line reads the Active side (1 question / 1 section / enUS).
    expect(screen.getByText(/1 question in 1 section/i)).toBeInTheDocument();
    expect(screen.getByText(/English \(US\)/)).toBeInTheDocument();

    // Flip to the draft.
    fireEvent.click(screen.getByRole("button", { name: /this draft/i }));

    // Now the draft questions show, the Active one does not.
    expect(screen.getByText("DRAFT_ONLY_Q1")).toBeInTheDocument();
    expect(screen.getByText("DRAFT_ONLY_Q2")).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE_ONLY_Q")).not.toBeInTheDocument();
    // Facts line reads the draft side (2 questions / 1 section / esES).
    expect(screen.getByText(/2 questions in 1 section/i)).toBeInTheDocument();
    expect(screen.getByText(/Spanish \(Spain\)/)).toBeInTheDocument();

    // Flip back to Active.
    fireEvent.click(screen.getByRole("button", { name: /^active/i }));
    expect(screen.getByText("ACTIVE_ONLY_Q")).toBeInTheDocument();
    expect(screen.queryByText("DRAFT_ONLY_Q1")).not.toBeInTheDocument();
  });

  it("labels the toggle with each side's version number", () => {
    render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={DRAFT_QUESTIONS}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={activePreview({ versionNumber: 3 })}
      />,
    );
    // Active is v3, the open draft is v4.
    expect(screen.getByRole("button", { name: /active.*v3/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /this draft.*v4/i })).toBeInTheDocument();
  });
});

// ── 2. Draft reflects an unsaved edit ─────────────────────────────────────────

describe("PreviewTab — live draft", () => {
  it("reflects an unsaved edit to the draft question array", () => {
    const { rerender } = render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={[questionDraft({ stableKey: "dq1", type: "TEXT", label: "ORIGINAL_LABEL", sortOrder: 1 })]}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={null}
      />,
    );
    expect(screen.getByText("ORIGINAL_LABEL")).toBeInTheDocument();

    // The editor mutates the in-memory model → the parent re-renders PreviewTab
    // with a new `questions` array. The draft preview must track it.
    rerender(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={[questionDraft({ stableKey: "dq1", type: "TEXT", label: "EDITED_LABEL", sortOrder: 1 })]}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={null}
      />,
    );
    expect(screen.getByText("EDITED_LABEL")).toBeInTheDocument();
    expect(screen.queryByText("ORIGINAL_LABEL")).not.toBeInTheDocument();
  });
});

// ── 3. No published version ⇒ draft-only + DRAFT label + no toggle ─────────────

describe("PreviewTab — draft-only fallback", () => {
  it("with no Active version: renders only the draft, a DRAFT label, and NO toggle", () => {
    render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={DRAFT_QUESTIONS}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={null}
      />,
    );
    // Draft content renders.
    expect(screen.getByText("DRAFT_ONLY_Q1")).toBeInTheDocument();
    // A DRAFT label is shown (draft-only fallback). Anchored so it targets the
    // pill, not the "DRAFT_ONLY_Q*" question labels.
    expect(screen.getByText(/^DRAFT · v/)).toBeInTheDocument();
    // NO version toggle.
    expect(screen.queryByRole("button", { name: /this draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^active/i })).not.toBeInTheDocument();
  });
});

// ── 4. Read-only render (previewMode) ─────────────────────────────────────────

describe("PreviewTab — read-only", () => {
  it("disables the question controls while keeping their labels readable", () => {
    render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={DRAFT_QUESTIONS}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={activePreview()}
      />,
    );
    // Active side (default): the TEXT control is disabled…
    const control = screen.getByLabelText("ACTIVE_ONLY_Q");
    expect(control).toBeDisabled();
    // …but the question label text stays in the accessibility tree (readable).
    expect(screen.getByText("ACTIVE_ONLY_Q")).toBeInTheDocument();
  });

  it("shows a read-only note that cross-links Test Mode", () => {
    render(
      <PreviewTab
        sections={DRAFT_SECTIONS}
        questions={DRAFT_QUESTIONS}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={null}
      />,
    );
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
  });
});

// ── 5. Empty template ⇒ graceful empty preview ────────────────────────────────

describe("PreviewTab — empty template", () => {
  it("renders SectionPager's graceful empty state with Submit disabled", () => {
    render(
      <PreviewTab
        sections={[]}
        questions={[]}
        version={DRAFT_VERSION}
        template={TEMPLATE}
        activePreview={null}
      />,
    );
    expect(screen.getByText(/nothing to answer yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });
});
