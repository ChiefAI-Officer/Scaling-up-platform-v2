/**
 * BUG-MAY13-2 (Task B2): SurveyTemplateEditor Results tab now mounts the
 * <SurveyResultsContent> body (the same per-question per-person renderer
 * used by the workshop-page survey views) instead of the legacy
 * <SurveyResultsPanel> aggregate-only panel.
 *
 * Key invariants under test:
 *   1. Results tab renders the SurveyResultsContent "Respondents" pill
 *      panel (proves we mounted SurveyResultsContent, not the deleted
 *      SurveyResultsPanel which had no pill panel).
 *   2. Workshop codes from each response are rendered (showWorkshop=true
 *      because responses span multiple workshops on the template view).
 *   3. Per-person RATING/NPS bullets render (Wave 12-C regression guard).
 *   4. TEXT answers + respondent attribution render verbatim through
 *      the answers + registration + workshop joins (data-shape guard).
 *   5. Only completed surveys appear in results (uncompleted ones are
 *      assignment rows, not response data — same filtering the legacy
 *      API route applied server-side).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { SurveyTemplateEditor } from "@/components/surveys/survey-template-editor";

// Build a fully-populated template-editor `template` payload (matches the
// SerializedTemplate shape served by the page-level Prisma fetch after
// the answers+question include was added in Task B2).
function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "tmpl-1",
    name: "Cross-Workshop Survey",
    description: null,
    surveyType: "POST_WORKSHOP",
    isActive: true,
    categoryId: null,
    createdBy: "admin-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    questions: [
      {
        id: "q-rating",
        templateId: "tmpl-1",
        sortOrder: 0,
        questionType: "RATING",
        label: "How would you rate this workshop?",
        description: null,
        isRequired: true,
        options: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "q-text",
        templateId: "tmpl-1",
        sortOrder: 1,
        questionType: "TEXT",
        label: "What did you learn?",
        description: null,
        isRequired: false,
        options: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
    surveys: [
      {
        id: "survey-1",
        surveyType: "POST_WORKSHOP",
        completedAt: "2026-05-10T00:00:00.000Z",
        sentAt: "2026-05-05T00:00:00.000Z",
        createdAt: "2026-05-05T00:00:00.000Z",
        npsScore: null,
        workshop: { title: "Scale Up Workshop", workshopCode: "WS-2026-AAAA" },
        registration: {
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
        },
        answers: [
          { id: "a-1a", questionId: "q-rating", value: null, numValue: 4 },
          { id: "a-1b", questionId: "q-text", value: "Pricing strategy", numValue: null },
        ],
      },
      {
        id: "survey-2",
        surveyType: "POST_WORKSHOP",
        completedAt: "2026-05-11T00:00:00.000Z",
        sentAt: "2026-05-05T00:00:00.000Z",
        createdAt: "2026-05-05T00:00:00.000Z",
        npsScore: null,
        workshop: { title: "Founder Bootcamp", workshopCode: "WS-2026-BBBB" },
        registration: {
          firstName: "Bob",
          lastName: "Jones",
          email: "bob@example.com",
        },
        answers: [
          { id: "a-2a", questionId: "q-rating", value: null, numValue: 5 },
          { id: "a-2b", questionId: "q-text", value: "Cohort growth", numValue: null },
        ],
      },
    ],
    ...overrides,
  };
}

describe("SurveyTemplateEditor Results tab (BUG-MAY13-2 / Task B2)", () => {
  it("renders SurveyResultsContent (Respondents pill + workshop codes + per-person RATING) when the Results tab is opened", () => {
    render(
      <SurveyTemplateEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template={buildTemplate() as any}
        workshops={[]}
        categories={[]}
        isNew={false}
      />
    );

    // The Results tab is hidden until clicked — the tab list lives in the
    // template editor's nav.
    const resultsTab = screen.getByRole("button", { name: /^results$/i });
    fireEvent.click(resultsTab);

    // (1) Respondents pill panel — proves we mounted <SurveyResultsContent>,
    // not the legacy <SurveyResultsPanel> (aggregate-only, no pill panel).
    expect(
      screen.getByText(/respondents \(2\)/i)
    ).toBeInTheDocument();

    // (2) Workshop codes render via the SurveyResultsContent showWorkshop
    // pathway. The pill panel renders one occurrence per respondent;
    // the per-person RATING row renders another. So we just need
    // getAllByText.length >= 1 for each.
    expect(screen.getAllByText("WS-2026-AAAA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("WS-2026-BBBB").length).toBeGreaterThanOrEqual(1);

    // (3) Per-person RATING bullets (Wave 12-C regression guard) — Jane 4/5,
    // Bob 5/5. Both must appear in the DOM with the /5 denominator.
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
    // Average over [4, 5] is 4.5.
    expect(screen.getByText(/Average: 4\.5/)).toBeInTheDocument();

    // (4) Respondent name attribution appears at least once each
    // (pill + per-question RATING bullet + TEXT attribution line).
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bob Jones").length).toBeGreaterThanOrEqual(1);
  });

  it("renders TEXT answers verbatim with respondent attribution — proves the answers + registration + workshop joins are wired", () => {
    render(
      <SurveyTemplateEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        template={buildTemplate() as any}
        workshops={[]}
        categories={[]}
        isNew={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^results$/i }));

    // Verbatim text answer bodies.
    expect(screen.getByText("Pricing strategy")).toBeInTheDocument();
    expect(screen.getByText("Cohort growth")).toBeInTheDocument();

    // Respondent attribution line for each (matches SurveyResultsContent's
    // "— <name>" pattern). Bob/Jane occur in the pill panel too, so use
    // a more targeted matcher.
    expect(screen.getByText(/—\s*Jane Smith/)).toBeInTheDocument();
    expect(screen.getByText(/—\s*Bob Jones/)).toBeInTheDocument();
  });

  it("renders the empty state when no surveys have been completed yet (filters by completedAt)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmpl: any = buildTemplate();
    // Strip completedAt from both surveys — they are now assignment rows,
    // not response data.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tmpl.surveys = tmpl.surveys.map((s: any) => ({ ...s, completedAt: null }));

    render(
      <SurveyTemplateEditor
        template={tmpl}
        workshops={[]}
        categories={[]}
        isNew={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^results$/i }));

    expect(
      screen.getByText(/no survey responses yet/i)
    ).toBeInTheDocument();
    // Pill panel must NOT appear in the empty state.
    expect(screen.queryByText(/respondents \(/i)).toBeNull();
  });
});
