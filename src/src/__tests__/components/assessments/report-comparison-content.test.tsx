import { render, screen, within } from "@testing-library/react";

import {
  ComparisonCoverSubtitle,
  DeltaValue,
  ReportComparisonContent,
} from "@/components/assessments/ReportComparisonContent";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";

const comparison: ReportComparisonModel = {
  baseline: {
    submissionId: "baseline-1",
    campaignId: "campaign-previous",
    campaignLabel: "Q1 2025",
    submittedAt: new Date("2025-03-31T12:00:00.000Z"),
    versionId: "version-1",
    versionNumber: 1,
    isImported: true,
  },
  sameVersion: false,
  overall: { current: 72, previous: 64, delta: null, status: "different-version" },
  domains: {
    people: { current: 7, previous: 6, delta: null, status: "different-version" },
  },
  sections: {
    team: { current: 6, previous: 4, delta: null, status: "different-version" },
  },
  questions: {
    q1: { current: 8, previous: 5, delta: 3, status: "comparable" },
    q2: { current: 4, previous: null, delta: null, status: "unmatched" },
    removed: { current: null, previous: 6, delta: null, status: "unmatched" },
  },
  coverage: {
    currentQuestionCount: 2,
    matchedQuestionCount: 1,
    unmatchedCurrentCount: 1,
    baselineOnlyCount: 1,
  },
};

describe("ReportComparisonContent", () => {
  it("renders the frozen comparison facts and excludes baseline-only question detail", () => {
    render(
      <ReportComparisonContent
        comparison={comparison}
        labels={{
          domains: { people: "People" },
          sections: { team: "Team health" },
          questions: { q1: "Weekly meeting rhythm", q2: "New leadership prompt" },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Compared results" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "Current" })).toHaveLength(4);
    expect(screen.getAllByRole("columnheader", { name: "Previous" })).toHaveLength(4);
    expect(screen.getAllByRole("columnheader", { name: "Change" })).toHaveLength(4);
    expect(screen.getByText("Overall result")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Team health")).toBeInTheDocument();
    expect(screen.getByText("Weekly meeting rhythm")).toBeInTheDocument();
    expect(screen.queryByText("removed")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Different version")).toHaveLength(3);
    expect(screen.getAllByText("Different version")).toHaveLength(3);
    expect(screen.getByLabelText("increase 3")).toHaveTextContent("▲ +3");
    expect(screen.getByText("New or changed question")).toBeInTheDocument();
    const incompatibleQuestionRow = screen.getByText("New leadership prompt").closest("tr");
    expect(incompatibleQuestionRow).not.toBeNull();
    const incompatibleCells = within(incompatibleQuestionRow!).getAllByRole("cell");
    expect(incompatibleCells[1]).toHaveTextContent("—");
    expect(incompatibleCells[2]).toHaveTextContent("—");
    expect(screen.getByText(/1 of 2 current questions matched the earlier version/i)).toBeInTheDocument();
    expect(screen.getByText(/1 baseline-only question was omitted/i)).toBeInTheDocument();
    expect(screen.queryByText(/recommendation|contact|peer|free text/i)).not.toBeInTheDocument();
  });

  it("uses non-color symbols and accessible signed direction for positive, negative, zero, and absent deltas", () => {
    const { rerender } = render(<DeltaValue value={{ current: 3, previous: 1, delta: 2, status: "comparable" }} />);
    expect(screen.getByLabelText("increase 2")).toHaveTextContent("▲ +2");

    rerender(<DeltaValue value={{ current: 1, previous: 3, delta: -2, status: "comparable" }} />);
    expect(screen.getByLabelText("decrease 2")).toHaveTextContent("▼ -2");

    rerender(<DeltaValue value={{ current: 3, previous: 3, delta: -0, status: "comparable" }} />);
    expect(screen.getByLabelText("no change 0")).toHaveTextContent("• 0");

    rerender(<DeltaValue value={{ current: null, previous: 3, delta: null, status: "unmatched" }} />);
    expect(screen.getByLabelText("Not comparable")).toHaveTextContent("—");
    expect(screen.getByText("Not comparable")).toBeInTheDocument();
  });

  it("adds the dated baseline subtitle and returns nothing when no comparison exists", () => {
    const { rerender } = render(<ComparisonCoverSubtitle comparison={comparison} />);
    expect(
      screen.getByText("Compared with Q1 2025 · Imported · submitted Mar 31, 2025"),
    ).toBeInTheDocument();

    rerender(<ComparisonCoverSubtitle comparison={null} />);
    expect(screen.queryByText(/Compared with/)).not.toBeInTheDocument();
  });
});
