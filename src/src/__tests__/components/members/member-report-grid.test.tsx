import { fireEvent, render, screen } from "@testing-library/react";
import { MemberReportGrid } from "@/components/members/MemberReportGrid";

const reports = [
  {
    submissionId: "one",
    assessmentName: "Rockefeller Habits Checklist",
    reportName: "Q3 Leadership Review",
    personName: null,
    companyName: null,
    completedAt: new Date("2026-09-01T00:00:00Z"),
    accent: "orange" as const,
  },
  {
    submissionId: "two",
    assessmentName: "Leadership Vision Alignment",
    reportName: "Executive Alignment",
    personName: "Alex Rivera",
    companyName: "Acme Inc.",
    completedAt: new Date("2026-08-01T00:00:00Z"),
    accent: "blue" as const,
  },
  {
    submissionId: "group-campaign",
    assessmentName: "Leadership Vision Alignment",
    reportName: "Leadership Team Alignment",
    personName: null,
    companyName: null,
    completedAt: new Date("2026-07-01T00:00:00Z"),
    accent: "blue" as const,
    kind: "group" as const,
    href: "/member/reports/team/group-campaign",
  },
];

describe("MemberReportGrid", () => {
  it("shows typographic cards with one action and no sharing controls or images", () => {
    const { container } = render(<MemberReportGrid reports={reports} />);
    expect(screen.getAllByRole("link", { name: "View report" })).toHaveLength(3);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText(/share|select all|deselect all/i)).toBeNull();
    expect(screen.queryByText(/For .*Q3 Leadership Review/)).toBeNull();
    expect(screen.getByText("For Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Acme Inc.")).toBeInTheDocument();
    expect(screen.getByText("Group report")).toBeInTheDocument();
    expect(screen.getByText("Leadership Team Alignment").closest("article")?.querySelector("a"))
      .toHaveAttribute("href", "/member/reports/team/group-campaign");
  });

  it("filters by report name without pagination", () => {
    render(<MemberReportGrid reports={reports} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "executive" } });
    expect(screen.queryByText("Q3 Leadership Review")).toBeNull();
    expect(screen.getByText("Executive Alignment")).toBeInTheDocument();
    expect(screen.queryByText(/next page|previous page/i)).toBeNull();
  });
});
