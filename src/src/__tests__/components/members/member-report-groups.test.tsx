import { fireEvent, render, screen } from "@testing-library/react";
import { MemberReportGroups } from "@/components/members/MemberReportGroups";
import type {
  MemberReportGroup,
  MemberReportListItem,
} from "@/lib/members/member-reports";

function item(
  campaignId: string,
  submissionId: string,
  overrides: Partial<MemberReportListItem> = {},
): MemberReportListItem {
  return {
    campaignId,
    campaignName: `Campaign ${campaignId}`,
    submissionId,
    kind: "personal",
    href: `/member/reports/${submissionId}`,
    assessmentName: "Scaling Up Full",
    reportName: `Campaign ${campaignId}`,
    personName: null,
    companyName: null,
    completedAt: new Date("2026-09-01T00:00:00Z"),
    accent: "brown",
    ...overrides,
  };
}

function group(
  campaignId: string,
  reports: MemberReportListItem[],
  overrides: Partial<MemberReportGroup> = {},
): MemberReportGroup {
  return {
    campaignId,
    campaignName: `Campaign ${campaignId}`,
    assessmentName: "Scaling Up Full",
    companyName: null,
    completedAt: new Date("2026-09-01T00:00:00Z"),
    accent: "brown",
    reports,
    ...overrides,
  };
}

describe("MemberReportGroups", () => {
  it("renders a single campaign expanded by default", () => {
    const reports = [item("one", "own")];
    render(<MemberReportGroups groups={[group("one", reports)]} />);

    expect(
      screen.getByRole("button", { name: /Campaign one/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "View report" })).toHaveAttribute(
      "href",
      "/member/reports/own",
    );
  });

  it("renders every campaign collapsed when there is more than one", () => {
    const firstReports = [item("one", "one-own")];
    const secondReports = [item("two", "two-own")];
    render(
      <MemberReportGroups
        groups={[
          group("one", firstReports),
          group("two", secondReports),
        ]}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getAllByRole("button")[0]).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getAllByRole("button")[1]).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: "View report" })).toBeNull();
  });

  it("auto-expands person-name matches and restores prior disclosure state when cleared", () => {
    render(
      <MemberReportGroups
        groups={[
          group("one", [
            item("one", "alex", { personName: "Alex Rivera" }),
          ]),
          group("two", [
            item("two", "jordan", { personName: "Jordan Lee" }),
          ]),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Campaign one/i }));
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "jordan" },
    });
    expect(screen.getByText("1 report in 1 campaign")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Campaign one/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Campaign two/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(
      screen.getByRole("button", { name: /Campaign one/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /Campaign two/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
