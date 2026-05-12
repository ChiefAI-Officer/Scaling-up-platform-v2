/**
 * Wave 12-C-1: Per-person RATING/NPS breakdown in SurveyResultsView
 *
 * RATING/NPS questions previously showed only an average. This test suite
 * verifies that each respondent's individual score is displayed below the
 * average line, using the formatRespondentLabel pattern already in place for
 * TEXT/TEXTAREA answers.
 */

import { render, screen } from "@testing-library/react";
import { SurveyResultsView } from "@/components/surveys/survey-results-view";

const BASE_PROPS = {
  workshopTitle: "Test Workshop",
  backHref: "/portal/workshops/ws-1",
};

describe("SurveyResultsView — per-person RATING/NPS breakdown (Wave 12-C-1)", () => {
  it("renders each respondent's score for a RATING question", () => {
    render(
      <SurveyResultsView
        {...BASE_PROPS}
        templateGroups={[
          {
            templateName: "Post-Workshop Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              {
                id: "q1",
                label: "How would you rate this workshop?",
                questionType: "RATING",
              },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: null, numValue: 5 },
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
                  { id: "a2", questionId: "q1", value: null, numValue: 4 },
                ],
                registration: {
                  firstName: "John",
                  lastName: "Doe",
                  email: "john@example.com",
                },
              },
              {
                id: "s3",
                answers: [
                  { id: "a3", questionId: "q1", value: null, numValue: 3 },
                ],
                registration: null,
              },
            ],
          },
        ]}
      />
    );

    // Average line still present
    expect(screen.getByText(/Average: 4\.0/)).toBeInTheDocument();

    // Names appear in both the Respondents pill panel and per-person breakdown
    expect(screen.getAllByText(/Jane Smith/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();

    expect(screen.getAllByText(/John Doe/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();

    // Anonymous respondent (null registration) — also appears in pill panel
    expect(screen.getAllByText(/Anonymous/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3\/5/)).toBeInTheDocument();
  });

  it("renders each respondent's score for an NPS question with /10 denominator", () => {
    render(
      <SurveyResultsView
        {...BASE_PROPS}
        templateGroups={[
          {
            templateName: "NPS Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              {
                id: "q2",
                label: "How likely are you to recommend?",
                questionType: "NPS",
              },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q2", value: null, numValue: 9 },
                ],
                registration: {
                  firstName: "Alice",
                  lastName: "Brown",
                  email: "alice@example.com",
                },
              },
              {
                id: "s2",
                answers: [
                  { id: "a2", questionId: "q2", value: null, numValue: 7 },
                ],
                registration: null,
              },
            ],
          },
        ]}
      />
    );

    // Average line
    expect(screen.getByText(/Average: 8\.0/)).toBeInTheDocument();

    // NPS uses /10 denominator — names appear in both Respondents pill and breakdown
    expect(screen.getAllByText(/Alice Brown/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/9\/10/)).toBeInTheDocument();

    expect(screen.getByText(/7\/10/)).toBeInTheDocument();
  });

  it("falls back to email when respondent has no name, for RATING question", () => {
    render(
      <SurveyResultsView
        {...BASE_PROPS}
        templateGroups={[
          {
            templateName: "Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              {
                id: "q1",
                label: "Rating",
                questionType: "RATING",
              },
            ],
            responses: [
              {
                id: "s1",
                answers: [
                  { id: "a1", questionId: "q1", value: null, numValue: 4 },
                ],
                registration: {
                  firstName: "",
                  lastName: "",
                  email: "noname@example.com",
                },
              },
            ],
          },
        ]}
      />
    );

    // email appears in both the Respondents pill and the per-person breakdown
    const emailMatches = screen.getAllByText(/noname@example\.com/);
    expect(emailMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
  });

  it("shows 'No responses' when RATING question has no numeric answers", () => {
    render(
      <SurveyResultsView
        {...BASE_PROPS}
        templateGroups={[
          {
            templateName: "Survey",
            surveyType: "POST_WORKSHOP",
            questions: [
              {
                id: "q1",
                label: "Rating",
                questionType: "RATING",
              },
            ],
            responses: [],
          },
        ]}
      />
    );

    expect(screen.getByText("No responses")).toBeInTheDocument();
  });
});
