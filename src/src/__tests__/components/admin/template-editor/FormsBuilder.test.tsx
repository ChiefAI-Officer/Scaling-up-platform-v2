/**
 * FormsBuilder — ED9 Task 10 (spec 19al-plan) tests.
 *
 * `FormsBuilder` is the flag-ON Google-Forms Build body: a THIN renderer over
 * `useSingleColumnBuilderController` (the SAME orchestration SingleColumnForm-
 * Builder now uses — DnD wiring, section grouping, card view-models, command
 * glue) composing `FormHeaderCard` (top) + `FormSectionCard` (per section) +
 * `FormQuestionCard` (per question, with the focused card's live body).
 *
 * Model fixtures mirror `single-column-builder.test.tsx` / `use-single-column-
 * builder-controller.test.tsx` (Financials/People; Revenue + Margin under
 * Financials, People empty) but in the direct model/`QuestionDraftRow` shape,
 * because FormsBuilder is NOT yet wired into `TabbedShell` (that's T11) — it is
 * rendered directly with a stubbed `model`. A stubbed `model` lets us spy on
 * `reorderQuestions`/`handleTemplateFieldChange` and drive `focusedQuestionUid`.
 *
 * `@dnd-kit/core`'s `DndContext` is replaced with a pass-through that captures
 * `onDragEnd` (jsdom can't drive a real dnd-kit drag — same limitation the
 * single-column suite documents), so a within-section drop can be invoked and
 * asserted to route to `model.reorderQuestions`. `SortableContext`/`useSortable`
 * read dnd-kit's default contexts and render fine without a real provider.
 *
 * ADD MODEL (Codex co-validate #4): question-add is SECTION-LOCAL only (the
 * section card's ⋯ menu + the empty-section add + the focused card's "+ below").
 * The bottom bar carries ONLY "+ Add section" — no global "+ Add question" — and
 * the empty state (no sections) offers ONLY add-section.
 */
import React from "react";
import { render, screen, act, within, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

import { FormsBuilder } from "@/components/admin/template-editor/FormsBuilder";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { TemplateEditorModel } from "@/components/admin/template-editor/hooks/useTemplateEditorModel";
import { GENERIC_INVITED_WELCOME_CONFIG } from "@/lib/assessments/invited-welcome-config";

// Capture the DndContext onDragEnd so a within-section drop can be invoked (jsdom
// can't drive a real dnd-kit drag). Everything else in @dnd-kit/core stays real
// (sensors, closestCenter); SortableContext/useSortable render off context
// defaults without a real DndContext provider.
let mockCapturedOnDragEnd: ((e: unknown) => void) | null = null;
jest.mock("@dnd-kit/core", () => {
  const actual = jest.requireActual("@dnd-kit/core");
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: (e: unknown) => void;
    }) => {
      mockCapturedOnDragEnd = onDragEnd;
      return children;
    },
  };
});

const originalConfirm = window.confirm;
beforeAll(() => {
  window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
});
afterAll(() => {
  window.confirm = originalConfirm;
});
beforeEach(() => {
  mockCapturedOnDragEnd = null;
});
afterEach(() => cleanup());

// ── Fixtures ────────────────────────────────────────────────────────────────
function q(
  uid: string,
  stableKey: string,
  sectionStableKey: string,
  sortOrder: number,
  extra: Partial<QuestionDraftRow> = {},
): QuestionDraftRow {
  return {
    uid,
    stableKey,
    sectionStableKey,
    label: `${stableKey} label`,
    helpText: "",
    isRequired: true,
    type: "SLIDER_LIKERT",
    sortOrder,
    scaleMin: 0,
    scaleMax: 10,
    scaleStep: 1,
    anchorMin: "Low",
    anchorMax: "High",
    options: [],
    maxChoices: null,
    isInherited: false,
    isNewToDraft: true,
    findingBands: [],
    findingOptionTexts: {},
    showIf: null,
    ...extra,
  };
}

const SECTIONS: SectionDraft[] = [
  { uid: "s1", stableKey: "S1", name: "Financials", description: "" },
  { uid: "s2", stableKey: "S2", name: "People", description: "" },
];

// Revenue + Margin under Financials; People empty — listed OUT of sortOrder in
// the array so bySection proves ascending grouping (mirrors the controller test).
function baseQuestions(): QuestionDraftRow[] {
  return [
    q("u2", "S1_margin", "S1", 2, {
      label: "Margin",
      type: "NUMBER",
      isRequired: false,
    }),
    q("u1", "S1_rev", "S1", 1, {
      label: "Revenue",
      type: "SLIDER_LIKERT",
      isRequired: true,
    }),
  ];
}

interface ModelOverrides {
  sections?: SectionDraft[];
  questions?: QuestionDraftRow[];
  focusedQuestionUid?: string | null;
  name?: string;
  description?: string;
}

function buildModel(o: ModelOverrides = {}) {
  const sections = o.sections ?? SECTIONS;
  const questions = o.questions ?? baseQuestions();
  const model = {
    templateValues: {
      name: o.name ?? "Alpha Form",
      description: o.description ?? "The team assessment",
    },
    handleTemplateFieldChange: jest.fn(),
    welcomeValues: {
      eyebrow: GENERIC_INVITED_WELCOME_CONFIG.eyebrow,
      headingTemplate: GENERIC_INVITED_WELCOME_CONFIG.headingTemplate,
      ledeParagraphs: [...GENERIC_INVITED_WELCOME_CONFIG.ledeParagraphs],
      sharingHeading: GENERIC_INVITED_WELCOME_CONFIG.sharingHeading,
      scoresHeading: GENERIC_INVITED_WELCOME_CONFIG.scoresHeading,
      scoresDescription: GENERIC_INVITED_WELCOME_CONFIG.scoresDescription,
      ctaLabel: GENERIC_INVITED_WELCOME_CONFIG.ctaLabel,
    },
    welcomeFinePrint: null,
    welcomeErrors: {},
    handleWelcomeFieldChange: jest.fn(),
    sections,
    questions,
    selection: {
      focusedQuestionUid: o.focusedQuestionUid ?? null,
      setFocusedQuestionUid: jest.fn(),
      setSectionCollapsed: jest.fn(),
      toggleSectionCollapsed: jest.fn(),
      isSectionCollapsed: jest.fn(() => false),
    },
    addQuestion: jest.fn(() => "u-new"),
    duplicateQuestion: jest.fn(() => "u-copy"),
    deleteQuestion: jest.fn((uid: string) => ({
      removedUid: uid,
      affectedDependentUids: [],
    })),
    deleteSection: jest.fn(() => ({
      removedSectionKey: "",
      removedQuestionUids: [],
      affectedDependentUids: [],
    })),
    moveQuestionToSection: jest.fn(),
    reorderQuestions: jest.fn(),
    handleSectionsRename: jest.fn(),
    handleSectionsSetDescription: jest.fn(),
    handleSectionsMoveUp: jest.fn(),
    handleSectionsMoveDown: jest.fn(),
    handleSectionsAdd: jest.fn(),
    handleUpdateQuestion: jest.fn(),
  };
  return model;
}

function renderBuilder(
  model: ReturnType<typeof buildModel>,
  opts: { isReadOnly?: boolean; adminOwnedPresentationEnabled?: boolean } = {},
) {
  return render(
    <FormsBuilder
      model={model as unknown as TemplateEditorModel}
      isReadOnly={opts.isReadOnly ?? false}
      isUnlocked
      findingsEnabled
      conditionalEnabled
      publishedOptionKeys={{}}
      onGoToSections={jest.fn()}
      adminOwnedPresentationEnabled={opts.adminOwnedPresentationEnabled}
    />,
  );
}

// ════════════════════════════════════════════════════════════════════════════
describe("FormsBuilder — structure", () => {
  it("renders the forms-builder container and the FormHeaderCard with the form title", () => {
    renderBuilder(buildModel({ name: "Team Health Check" }));
    expect(screen.getByTestId("forms-builder")).toBeInTheDocument();
    expect(screen.getByTestId("form-header-card")).toBeInTheDocument();
    expect(screen.getByTestId("form-header-title")).toHaveValue("Team Health Check");
  });

  it("renders one FormSectionCard per section", () => {
    renderBuilder(buildModel());
    expect(screen.getByTestId("form-section-card-s1")).toBeInTheDocument();
    expect(screen.getByTestId("form-section-card-s2")).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-testid^="form-section-card-"]').length,
    ).toBe(2);
  });

  it("inserts the fixed Welcome card after the header and before Section 1 only when enabled", () => {
    renderBuilder(buildModel());
    expect(screen.queryByTestId("welcome-screen-card")).not.toBeInTheDocument();

    cleanup();
    renderBuilder(buildModel(), { adminOwnedPresentationEnabled: true });
    const header = screen.getByTestId("form-header-card");
    const welcome = screen.getByTestId("welcome-screen-card");
    const section = screen.getByTestId("forms-section-S1");
    expect(header.compareDocumentPosition(welcome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(welcome.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a FormQuestionCard per question", () => {
    renderBuilder(buildModel());
    expect(screen.getByTestId("form-question-card-u1")).toBeInTheDocument();
    expect(screen.getByTestId("form-question-card-u2")).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-testid^="form-question-card-"]').length,
    ).toBe(2);
  });

  it("renders the focused question's expanded body", () => {
    renderBuilder(buildModel({ focusedQuestionUid: "u1" }));
    expect(screen.getByTestId("form-card-body-u1")).toBeInTheDocument();
    // The non-focused card stays collapsed (no body).
    expect(screen.queryByTestId("form-card-body-u2")).not.toBeInTheDocument();
  });
});

describe("FormsBuilder — add model (section-local only)", () => {
  it("the bottom bar has '+ Add section' and NO global '+ Add question'", () => {
    renderBuilder(buildModel());
    const bar = screen.getByTestId("forms-bottom-bar");
    expect(within(bar).getByText("+ Add section")).toBeInTheDocument();
    expect(within(bar).queryByText(/add question/i)).not.toBeInTheDocument();
    // No un-scoped, global add-question affordance anywhere.
    expect(
      document.querySelector('[data-testid="forms-add-question"]'),
    ).toBeNull();
  });

  it("'+ Add section' routes to model.handleSectionsAdd", () => {
    const model = buildModel();
    renderBuilder(model);
    screen.getByTestId("forms-add-section").click();
    expect(model.handleSectionsAdd).toHaveBeenCalledTimes(1);
  });

  it("offers a SECTION-LOCAL add-question inside an empty section only", () => {
    renderBuilder(buildModel());
    // People (S2) is empty ⇒ it shows a section-scoped add-question button.
    expect(screen.getByTestId("forms-add-question-S2")).toBeInTheDocument();
  });

  it("the empty state (no sections) shows ONLY add-section", () => {
    renderBuilder(buildModel({ sections: [], questions: [] }), {
      adminOwnedPresentationEnabled: true,
    });
    expect(screen.getByTestId("forms-builder")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-screen-card")).toBeInTheDocument();
    expect(screen.getByTestId("forms-builder-add-first-section")).toBeInTheDocument();
    // No add-question affordance can exist without a section.
    expect(screen.queryByText(/add question/i)).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-testid^="forms-add-question"]'),
    ).toBeNull();
  });
});

describe("FormsBuilder — drag wiring", () => {
  it("a within-section drop routes to model.reorderQuestions", () => {
    const model = buildModel();
    renderBuilder(model);
    expect(mockCapturedOnDragEnd).not.toBeNull();
    act(() => {
      mockCapturedOnDragEnd!({ active: { id: "u1" }, over: { id: "u2" } });
    });
    expect(model.reorderQuestions).toHaveBeenCalledTimes(1);
    expect(model.reorderQuestions).toHaveBeenCalledWith("S1", ["u2", "u1"]);
  });
});

describe("FormsBuilder — isReadOnly", () => {
  it("hides every add/edit affordance", () => {
    renderBuilder(buildModel(), { isReadOnly: true });
    // Bottom-bar add-section gone.
    expect(screen.queryByTestId("forms-add-section")).not.toBeInTheDocument();
    // Empty-section add-question gone.
    expect(screen.queryByTestId("forms-add-question-S2")).not.toBeInTheDocument();
    // Section ⋯ menu trigger gone.
    expect(screen.queryByTestId("section-menu-S1")).not.toBeInTheDocument();
    // Question drag handle gone.
    expect(screen.queryByTestId("form-drag-handle-u1")).not.toBeInTheDocument();
    // Header title input disabled.
    expect(screen.getByTestId("form-header-title")).toBeDisabled();
  });
});
