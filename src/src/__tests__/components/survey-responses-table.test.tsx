/**
 * Round 15 Wave 4: <SurveyResponsesTable>.
 *
 * Per-response browse table for the aggregated survey results page. Renders
 * one row per completed survey with sortable columns, conditional answer
 * columns (NPS Score / Avg Rating / Comment), an empty state, and a cap
 * banner. Workshop column links to /workshops/<workshopId> (admin detail).
 *
 * IMPORTANT: no "Respondent" column here — respondent identity is for the
 * CSV export only (PII-aware at-a-glance UX).
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import { SurveyResponsesTable } from "@/components/surveys/survey-responses-table";
import type { SurveyResponseRow } from "@/lib/surveys/survey-service";
import type { SurveyQuestion } from "@prisma/client";

// -------- helpers --------

function buildQuestion(over: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return {
    id: over.id ?? "q1",
    templateId: over.templateId ?? "t1",
    sortOrder: over.sortOrder ?? 0,
    questionType: over.questionType ?? "RATING",
    label: over.label ?? "Question",
    isRequired: over.isRequired ?? false,
    helpText: over.helpText ?? null,
    options: over.options ?? null,
    minLabel: over.minLabel ?? null,
    maxLabel: over.maxLabel ?? null,
    minValue: over.minValue ?? null,
    maxValue: over.maxValue ?? null,
    createdAt: over.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: over.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  } as SurveyQuestion;
}

function buildRow(over: Partial<SurveyResponseRow> & {
  answers?: Array<{ questionId: string; value?: string | null; numValue?: number | null }>;
} = {}): SurveyResponseRow {
  const answersByQuestionId = new Map<string, { value: string | null; numValue: number | null }>();
  for (const a of over.answers ?? []) {
    answersByQuestionId.set(a.questionId, {
      value: a.value ?? null,
      numValue: a.numValue ?? null,
    });
  }
  return {
    surveyId: over.surveyId ?? "s1",
    workshop: over.workshop ?? { id: "w1", title: "Workshop One", workshopCode: "WS-2026-AAAA" },
    coach: over.coach === undefined ? { id: "c1", name: "Alice Coach" } : over.coach,
    category: over.category === undefined ? { id: "cat1", name: "Sales" } : over.category,
    respondent: over.respondent === undefined
      ? { firstName: "Bob", lastName: "Reg", email: "bob@example.com" }
      : over.respondent,
    completedAt: over.completedAt ?? new Date("2026-05-10T12:00:00Z"),
    answersByQuestionId,
  };
}

// -------- spec tests --------

describe("SurveyResponsesTable (Round 15 Wave 4)", () => {
  it("renders rows with workshop link to /workshops/<id>", () => {
    const questions = [buildQuestion({ id: "q1", questionType: "TEXT", label: "Comment" })];
    const rows = [
      buildRow({
        workshop: { id: "ws-abc", title: "Workshop Alpha", workshopCode: "WS-2026-ABCD" },
        answers: [{ questionId: "q1", value: "Great content" }],
      }),
    ];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={1}
        cappedAt={null}
        exportHref="/api/surveys/export?templateId=t1"
      />
    );

    const link = screen.getByRole("link", { name: /Workshop Alpha/ });
    expect(link).toHaveAttribute("href", "/workshops/ws-abc");
  });

  it("toggles sort direction ASC/DESC when the same column header is clicked twice", () => {
    const questions = [buildQuestion({ id: "q1", questionType: "TEXT", label: "Comment" })];
    const rows = [
      buildRow({
        surveyId: "s1",
        workshop: { id: "w1", title: "Beta Workshop", workshopCode: "WS-2026-BETA" },
        completedAt: new Date("2026-05-10T12:00:00Z"),
        answers: [{ questionId: "q1", value: "x" }],
      }),
      buildRow({
        surveyId: "s2",
        workshop: { id: "w2", title: "Alpha Workshop", workshopCode: "WS-2026-ALPH" },
        completedAt: new Date("2026-05-11T12:00:00Z"),
        answers: [{ questionId: "q1", value: "y" }],
      }),
    ];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={2}
        cappedAt={null}
        exportHref="/export"
      />
    );

    // Initial: completedAt DESC → s2 (newer) first, s1 second.
    let bodyRows = screen.getAllByRole("row").slice(1); // drop header row
    expect(within(bodyRows[0]).getByRole("link", { name: /Alpha Workshop/ })).toBeInTheDocument();

    // Click "Workshop" header → switch to Workshop ASC ("Alpha…" before "Beta…").
    // Exact-match regex (^...$) so this doesn't accidentally match "Workshop Code".
    const workshopHeader = screen.getByRole("button", { name: /^Workshop$/i });
    fireEvent.click(workshopHeader);
    bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByRole("link", { name: /Alpha Workshop/ })).toBeInTheDocument();
    expect(within(bodyRows[1]).getByRole("link", { name: /Beta Workshop/ })).toBeInTheDocument();

    // Click again → toggle to DESC.
    fireEvent.click(workshopHeader);
    bodyRows = screen.getAllByRole("row").slice(1);
    expect(within(bodyRows[0]).getByRole("link", { name: /Beta Workshop/ })).toBeInTheDocument();
    expect(within(bodyRows[1]).getByRole("link", { name: /Alpha Workshop/ })).toBeInTheDocument();
  });

  it("hides the NPS Score column when no rows have NPS answers", () => {
    const questions = [buildQuestion({ id: "q1", questionType: "TEXT", label: "Comment" })];
    const rows = [
      buildRow({ answers: [{ questionId: "q1", value: "feedback" }] }),
    ];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={1}
        cappedAt={null}
        exportHref="/export"
      />
    );

    expect(screen.queryByText(/NPS Score/i)).not.toBeInTheDocument();
  });

  it("shows the cap banner when cappedAt is set, hides it when null", () => {
    const questions = [buildQuestion({ id: "q1", questionType: "TEXT", label: "Comment" })];
    const rows = [buildRow({ answers: [{ questionId: "q1", value: "x" }] })];

    const { rerender } = render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={1234}
        cappedAt={500}
        exportHref="/export"
      />
    );
    expect(screen.getByText(/Showing 500 of 1234/i)).toBeInTheDocument();

    rerender(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={1}
        cappedAt={null}
        exportHref="/export"
      />
    );
    expect(screen.queryByText(/Showing \d+ of /i)).not.toBeInTheDocument();
  });

  it("renders the empty state when rows.length === 0", () => {
    render(
      <SurveyResponsesTable
        rows={[]}
        questions={[buildQuestion({ id: "q1", questionType: "TEXT" })]}
        surveyType="POST_WORKSHOP"
        totalCount={0}
        cappedAt={null}
        exportHref="/export"
      />
    );

    expect(screen.getByText(/No responses match these filters\./i)).toBeInTheDocument();
  });

  // -------- bonus --------

  it("wires the Export CSV link to exportHref", () => {
    render(
      <SurveyResponsesTable
        rows={[]}
        questions={[]}
        surveyType="POST_WORKSHOP"
        totalCount={0}
        cappedAt={null}
        exportHref="/api/surveys/responses.csv?templateId=t1&coachId=c1"
      />
    );

    const csvLink = screen.getByRole("link", { name: /Export CSV/i });
    expect(csvLink).toHaveAttribute("href", "/api/surveys/responses.csv?templateId=t1&coachId=c1");
  });

  it("truncates long comment values to 60 chars with an ellipsis", () => {
    const longText = "A".repeat(80);
    const questions = [buildQuestion({ id: "q1", questionType: "TEXTAREA", label: "Comment" })];
    const rows = [buildRow({ answers: [{ questionId: "q1", value: longText }] })];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={1}
        cappedAt={null}
        exportHref="/export"
      />
    );

    // 60 "A"s + an ellipsis character.
    const expected = `${"A".repeat(60)}…`;
    expect(screen.getByText(expected)).toBeInTheDocument();
    // The full string is NOT rendered.
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it("sets aria-sort on the active column header (Completed At descending by default, switches on header click)", () => {
    const questions = [buildQuestion({ id: "q1", questionType: "TEXT", label: "Comment" })];
    const rows = [
      buildRow({
        surveyId: "s1",
        workshop: { id: "w1", title: "Beta Workshop", workshopCode: "WS-2026-BETA" },
        completedAt: new Date("2026-05-10T12:00:00Z"),
        answers: [{ questionId: "q1", value: "x" }],
      }),
      buildRow({
        surveyId: "s2",
        workshop: { id: "w2", title: "Alpha Workshop", workshopCode: "WS-2026-ALPH" },
        completedAt: new Date("2026-05-11T12:00:00Z"),
        answers: [{ questionId: "q1", value: "y" }],
      }),
    ];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={2}
        cappedAt={null}
        exportHref="/export"
      />
    );

    // Initial state: Completed At header is the active sort (descending).
    const completedHeader = screen.getByRole("columnheader", { name: /Completed At/i });
    expect(completedHeader).toHaveAttribute("aria-sort", "descending");

    // Other sortable headers should be "none".
    const workshopColumnHeader = screen.getByRole("columnheader", { name: /^Workshop$/i });
    expect(workshopColumnHeader).toHaveAttribute("aria-sort", "none");

    // Click the Workshop header → it becomes active (ascending), Completed At resets to "none".
    fireEvent.click(screen.getByRole("button", { name: /^Workshop$/i }));
    expect(workshopColumnHeader).toHaveAttribute("aria-sort", "ascending");
    expect(completedHeader).toHaveAttribute("aria-sort", "none");
  });

  it("computes Avg Rating across RATING-type answers, rounded to 1 decimal; em-dash when none", () => {
    const questions = [
      buildQuestion({ id: "q1", questionType: "RATING", label: "Quality" }),
      buildQuestion({ id: "q2", questionType: "RATING", label: "Pacing" }),
    ];
    const rows = [
      buildRow({
        surveyId: "s1",
        workshop: { id: "wA", title: "RowA", workshopCode: "WS-A" },
        answers: [
          { questionId: "q1", numValue: 4 },
          { questionId: "q2", numValue: 5 },
        ],
      }),
      buildRow({
        surveyId: "s2",
        workshop: { id: "wB", title: "RowB", workshopCode: "WS-B" },
        answers: [], // no rating answers → em-dash
      }),
    ];

    render(
      <SurveyResponsesTable
        rows={rows}
        questions={questions}
        surveyType="POST_WORKSHOP"
        totalCount={2}
        cappedAt={null}
        exportHref="/export"
      />
    );

    // Avg of 4 and 5 → 4.5
    expect(screen.getByText("4.5")).toBeInTheDocument();
    // RowB row has em-dash for Avg Rating (also other empty cells; the explicit assert is "—" present).
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
