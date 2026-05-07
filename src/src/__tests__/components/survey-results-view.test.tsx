/**
 * BUG-MAY6-8: shared SurveyResultsView component used by BOTH coach and admin
 * per-workshop survey results pages. Codex: don't mount coach component raw on
 * admin — extract shared, mount on both with appropriate auth in the page wrapper.
 */

import { render, screen } from "@testing-library/react";
import { SurveyResultsView } from "@/components/surveys/survey-results-view";

describe("SurveyResultsView (BUG-MAY6-8 shared parity component)", () => {
  it("renders empty state when no surveys exist", () => {
    render(
      <SurveyResultsView
        workshopTitle="Test Workshop"
        backHref="/workshops/ws-1"
        templateGroups={[]}
      />
    );
    expect(
      screen.getByText(/no survey responses yet/i)
    ).toBeInTheDocument();
  });

  it("renders template name + response count when surveys exist", () => {
    render(
      <SurveyResultsView
        workshopTitle="Test Workshop"
        backHref="/workshops/ws-1"
        templateGroups={[
          {
            templateName: "Pre-Workshop Survey",
            surveyType: "PRE_WORKSHOP",
            questions: [
              { id: "q1", label: "What is your goal?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Learn growth", numValue: null },
                ],
              },
              {
                id: "s2",
                answers: [
                  { id: "a2", questionId: "q1", value: "Scale up", numValue: null },
                ],
              },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText("Pre-Workshop Survey")).toBeInTheDocument();
    expect(screen.getByText(/2 responses/i)).toBeInTheDocument();
    expect(screen.getByText("What is your goal?")).toBeInTheDocument();
    // BUG-MAY6-8: text answers must render (per-workshop view always shows them,
    // unlike the cross-workshop aggregate view which is the Phase 2 BUG-MAY6-9 fix)
    expect(screen.getByText("Learn growth")).toBeInTheDocument();
    expect(screen.getByText("Scale up")).toBeInTheDocument();
  });

  it("computes RATING question average across responses", () => {
    render(
      <SurveyResultsView
        workshopTitle="Test Workshop"
        backHref="/workshops/ws-1"
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Rate the workshop", questionType: "RATING" },
            ],
            responses: [
              { id: "s1", answers: [{ id: "a1", questionId: "q1", value: "5", numValue: 5 }] },
              { id: "s2", answers: [{ id: "a2", questionId: "q1", value: "3", numValue: 3 }] },
            ],
          },
        ]}
      />
    );
    expect(screen.getByText(/Average: 4\.0/i)).toBeInTheDocument();
  });
});
