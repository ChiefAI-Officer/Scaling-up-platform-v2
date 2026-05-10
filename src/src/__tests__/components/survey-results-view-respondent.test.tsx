/**
 * BUG-MAY6-9 (Wave 6 Tier A): per-survey respondent attribution.
 *
 * Per-workshop survey results pages already fetch `survey.registration` but
 * discard it before passing to <SurveyResultsView>. This test fixes the
 * component to *accept* registration on each response and render attribution
 * next to TEXT/TEXTAREA answers + a Respondents pill panel mirroring the
 * aggregate page's pattern (ENH-MAY6-8).
 */

import { render, screen, within } from "@testing-library/react";
import { SurveyResultsView } from "@/components/surveys/survey-results-view";

describe("SurveyResultsView respondent attribution (BUG-MAY6-9)", () => {
  const baseProps = {
    workshopTitle: "Test Workshop",
    backHref: "/workshops/ws-1",
  };

  it("renders respondent name next to each TEXT answer", () => {
    render(
      <SurveyResultsView
        {...baseProps}
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "What did you learn?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Pricing strategy", numValue: null },
                ],
                registration: {
                  firstName: "Alice",
                  lastName: "Smith",
                  email: "alice@example.com",
                },
              },
              {
                id: "s2",
                answers: [
                  { id: "a2", questionId: "q1", value: "Cohort growth", numValue: null },
                ],
                registration: {
                  firstName: "Bob",
                  lastName: "Jones",
                  email: "bob@example.com",
                },
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Pricing strategy")).toBeInTheDocument();
    expect(screen.getByText("Cohort growth")).toBeInTheDocument();
    expect(screen.getByText(/—\s*Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText(/—\s*Bob Jones/)).toBeInTheDocument();
  });

  it("renders 'Anonymous' next to TEXT answer when registration is null", () => {
    render(
      <SurveyResultsView
        {...baseProps}
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Feedback?", questionType: "TEXTAREA" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Loved it", numValue: null },
                ],
                registration: null,
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Loved it")).toBeInTheDocument();
    expect(screen.getByText(/—\s*Anonymous/)).toBeInTheDocument();
  });

  it("falls back to email when first/last name are empty", () => {
    render(
      <SurveyResultsView
        {...baseProps}
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Comment?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: "Great", numValue: null },
                ],
                registration: {
                  firstName: "",
                  lastName: "",
                  email: "ghost@example.com",
                },
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Great")).toBeInTheDocument();
    expect(screen.getByText(/—\s*ghost@example.com/)).toBeInTheDocument();
  });

  it("renders Respondents panel listing all respondents (count + names)", () => {
    render(
      <SurveyResultsView
        {...baseProps}
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              { id: "q1", label: "Goal?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [{ id: "a1", questionId: "q1", value: "Grow", numValue: null }],
                registration: {
                  firstName: "Alice",
                  lastName: "Smith",
                  email: "alice@example.com",
                },
              },
              {
                id: "s2",
                answers: [{ id: "a2", questionId: "q1", value: "Scale", numValue: null }],
                registration: {
                  firstName: "Bob",
                  lastName: "Jones",
                  email: "bob@example.com",
                },
              },
              {
                id: "s3",
                answers: [{ id: "a3", questionId: "q1", value: "Learn", numValue: null }],
                registration: null,
              },
            ],
          },
        ]}
      />
    );

    const panelHeading = screen.getByText(/Respondents \(3\)/);
    expect(panelHeading).toBeInTheDocument();

    const panel = panelHeading.closest("div");
    expect(panel).not.toBeNull();
    const w = within(panel as HTMLElement);
    expect(w.getByText("Alice Smith")).toBeInTheDocument();
    expect(w.getByText("Bob Jones")).toBeInTheDocument();
    expect(w.getByText("Anonymous")).toBeInTheDocument();
  });

  it("does not crash when responses have no registration field at all (back-compat)", () => {
    render(
      <SurveyResultsView
        {...baseProps}
        templateGroups={[
          {
            templateName: "Pre-Workshop Survey",
            surveyType: "PRE_WORKSHOP",
            questions: [
              { id: "q1", label: "Goal?", questionType: "TEXT" },
            ],
            responses: [
              {
                id: "s1",
                answers: [{ id: "a1", questionId: "q1", value: "Grow", numValue: null }],
                // No registration field — older callers / tests may omit it.
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText("Grow")).toBeInTheDocument();
    expect(screen.getByText(/—\s*Anonymous/)).toBeInTheDocument();
  });
});
