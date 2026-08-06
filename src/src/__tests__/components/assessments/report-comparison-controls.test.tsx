import { fireEvent, render, screen } from "@testing-library/react";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ReportComparisonControls } from "@/components/assessments/ReportComparisonControls";

const candidates = [
  {
    submissionId: "prior/newest",
    campaignId: "campaign-2025-q4",
    campaignLabel: "Q4 2025 Assessment",
    submittedAt: new Date("2025-12-31T00:00:00.000Z"),
    versionId: "version-1",
    versionNumber: 1,
    isImported: true,
  },
  {
    submissionId: "prior-older",
    campaignId: "campaign-2025-q3",
    campaignLabel: null,
    submittedAt: new Date("2025-09-30T00:00:00.000Z"),
    versionId: "version-1",
    versionNumber: 1,
    isImported: false,
  },
];

describe("ReportComparisonControls", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("preselects the newest candidate without starting a comparison", () => {
    render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId={null}
        bounded={false}
        canonicalHref="/assessments/campaign-current/respondents/respondent-1/report"
      />,
    );

    const select = screen.getByLabelText("Compare to previous assessment");
    expect(select).toHaveValue("prior/newest");
    expect(screen.getByRole("button", { name: "Compare" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("uses campaign, date, and imported provenance in candidate copy", () => {
    render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId={null}
        bounded={false}
        canonicalHref="/report"
      />,
    );

    expect(screen.getByRole("option", { name: /Q4 2025 Assessment · Submitted Dec 31, 2025 · Imported/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Scaling Up Assessment · Sep 30, 2025" })).toBeInTheDocument();
  });

  it("navigates to the encoded selected baseline when Compare is pressed", () => {
    render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId={null}
        bounded={false}
        canonicalHref="/assessments/campaign-current/respondents/respondent-1/report"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    expect(push).toHaveBeenCalledWith(
      "/assessments/campaign-current/respondents/respondent-1/report?compareTo=prior%2Fnewest",
    );
  });

  it("lets an active comparison change its baseline or return to the canonical report", () => {
    render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId="prior-older"
        bounded={false}
        canonicalHref="/assessments/campaign-current/respondents/respondent-1/report"
      />,
    );

    expect(screen.queryByLabelText("Compare to previous assessment")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change comparison" }));
    expect(screen.getByLabelText("Compare to previous assessment")).toHaveValue("prior-older");

    fireEvent.click(screen.getByRole("button", { name: "Remove comparison" }));
    expect(push).toHaveBeenCalledWith(
      "/assessments/campaign-current/respondents/respondent-1/report",
    );
  });

  it("synchronizes picker and changing state after same-route server props update", () => {
    const canonicalHref =
      "/assessments/campaign-current/respondents/respondent-1/report";
    const { rerender } = render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId={null}
        bounded={false}
        canonicalHref={canonicalHref}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Compare to previous assessment"),
      { target: { value: "prior-older" } },
    );
    rerender(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId="prior/newest"
        bounded={false}
        canonicalHref={canonicalHref}
      />,
    );

    expect(
      screen.queryByLabelText("Compare to previous assessment"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Comparing with Q4 2025 Assessment/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change comparison" }));
    expect(screen.getByLabelText("Compare to previous assessment")).toHaveValue(
      "prior/newest",
    );

    rerender(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId="prior-older"
        bounded={false}
        canonicalHref={canonicalHref}
      />,
    );
    expect(
      screen.queryByLabelText("Compare to previous assessment"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Comparing with Scaling Up Assessment · Sep 30, 2025/),
    ).toBeInTheDocument();
  });

  it("keeps controls off the printed report and discloses a bounded history", () => {
    const { container } = render(
      <ReportComparisonControls
        candidates={candidates}
        selectedSubmissionId={null}
        bounded
        canonicalHref="/report"
      />,
    );

    expect(container.firstElementChild).toHaveClass("no-print");
    expect(screen.getByText("Showing 12 most recent")).toBeInTheDocument();
  });
});
