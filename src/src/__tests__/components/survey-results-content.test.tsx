/**
 * BUG-MAY13-2 (Task B1): SurveyResultsContent — pure body extracted from
 * SurveyResultsView so it can be reused by the template editor's Results tab.
 *
 * Key invariants under test:
 *   1. `showWorkshop={true}` renders workshop attribution as a SEPARATE DOM
 *      node (not spliced into the respondent label string). The workshop code
 *      and the respondent name must be in DIFFERENT elements.
 *   2. `showWorkshop={false}` (default) renders no workshop info — regression
 *      guard for workshop-page consumers (admin + coach pages).
 *   3. Per-person RATING/NPS rendering still works (Wave 12-C regression guard).
 *   4. Empty templateGroups renders an empty state.
 */

import { render, screen } from "@testing-library/react";
import { SurveyResultsContent } from "@/components/surveys/survey-results-view";

describe("SurveyResultsContent (BUG-MAY13-2 / Task B1)", () => {
  it("renders workshop attribution as a structured element separate from respondent label when showWorkshop=true", () => {
    render(
      <SurveyResultsContent
        showWorkshop
        templateGroups={[
          {
            templateName: "Cross-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Feedback?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Loved it", numValue: null },
                ],
                registration: {
                  firstName: "Jane",
                  lastName: "Smith",
                  email: "jane@example.com",
                },
                workshop: {
                  title: "Scale Up Workshop",
                  workshopCode: "WS-2026-AAAA",
                },
              },
              {
                id: "s2",
                answers: [
                  { id: "a2", questionId: "q1", value: "Great pacing", numValue: null },
                ],
                registration: {
                  firstName: "Bob",
                  lastName: "Jones",
                  email: "bob@example.com",
                },
                workshop: {
                  title: "Founder Bootcamp",
                  workshopCode: "WS-2026-BBBB",
                },
              },
            ],
          },
        ]}
      />
    );

    // BOTH workshop codes appear in the DOM
    const codeA = screen.getAllByText("WS-2026-AAAA");
    const codeB = screen.getAllByText("WS-2026-BBBB");
    expect(codeA.length).toBeGreaterThanOrEqual(1);
    expect(codeB.length).toBeGreaterThanOrEqual(1);

    // Critical anti-pattern guard: the workshop code MUST be a separate DOM
    // node from the respondent name. If someone regresses to splicing
    // "Jane Smith — WS-2026-AAAA" into a single string, this fails.
    const janeNode = screen.getAllByText("Jane Smith")[0];
    expect(janeNode).toBeDefined();
    // The text "Jane Smith" must NOT itself contain "WS-2026-AAAA"
    expect(janeNode.textContent).toBe("Jane Smith");
    // And "WS-2026-AAAA" must NOT contain the respondent name
    expect(codeA[0].textContent).toBe("WS-2026-AAAA");
    // Confirm they are different DOM nodes
    expect(janeNode).not.toBe(codeA[0]);
  });

  it("does NOT render workshop info when showWorkshop=false (default), even if responses have a workshop field — regression guard for workshop-page consumers", () => {
    render(
      <SurveyResultsContent
        templateGroups={[
          {
            templateName: "Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Feedback?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Loved it", numValue: null },
                ],
                registration: {
                  firstName: "Jane",
                  lastName: "Smith",
                  email: "jane@example.com",
                },
                // Workshop field present BUT showWorkshop defaults to false,
                // so this must NOT render.
                workshop: {
                  title: "Scale Up Workshop",
                  workshopCode: "WS-2026-AAAA",
                },
              },
            ],
          },
        ]}
      />
    );

    // Respondent still renders normally
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Loved it")).toBeInTheDocument();
    // Workshop code MUST NOT appear in the DOM
    expect(screen.queryByText("WS-2026-AAAA")).toBeNull();
    expect(screen.queryByText("Scale Up Workshop")).toBeNull();
  });

  it("still renders per-person RATING/NPS breakdown (Wave 12-C regression guard)", () => {
    render(
      <SurveyResultsContent
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "How would you rate this?", questionType: "RATING" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: null, numValue: 4 },
                ],
                registration: {
                  firstName: "Jane",
                  lastName: "Smith",
                  email: "jane@example.com",
                },
              },
              {
                id: "s2",
                answers: [
                  { id: "a2", questionId: "q1", value: null, numValue: 5 },
                ],
                registration: {
                  firstName: "John",
                  lastName: "Doe",
                  email: "john@example.com",
                },
              },
            ],
          },
        ]}
      />
    );

    // Average line still there
    expect(screen.getByText(/Average: 4\.5/)).toBeInTheDocument();
    // Per-person breakdown still there
    expect(screen.getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
    expect(screen.getAllByText("John Doe").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
  });

  it("renders empty state when templateGroups is empty", () => {
    render(<SurveyResultsContent templateGroups={[]} />);
    expect(screen.getByText(/no survey responses yet/i)).toBeInTheDocument();
  });
});
