import React from "react";
import { render, screen } from "@testing-library/react";

const mockGroupingEnabled = jest.fn(() => false);
const mockSession = jest.fn();
const mockList = jest.fn();
const mockResolveIdentity = jest.fn();

jest.mock("next/navigation", () => ({ notFound: jest.fn() }));
jest.mock("@/lib/members/flags", () => ({
  isMemberPortalEnabled: () => true,
  isMemberReportGroupingEnabled: () => mockGroupingEnabled(),
}));
jest.mock("@/lib/members/session", () => ({
  requireMemberSession: () => mockSession(),
}));
jest.mock("@/lib/members/identity", () => ({
  resolveMemberIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
}));
jest.mock("@/lib/members/member-reports", () => ({
  listMemberReports: (...args: unknown[]) => mockList(...args),
}));
jest.mock("@/lib/db", () => ({
  db: {
    orgRespondent: {
      findUnique: jest.fn().mockResolvedValue({
        firstName: "Casey",
        lastName: "Member",
      }),
    },
  },
}));
jest.mock("@/components/members/MemberPortalHeader", () => ({
  MemberPortalHeader: () => <div>Member header</div>,
}));
jest.mock("@/components/members/MemberReportGrid", () => ({
  MemberReportGrid: () => <div data-testid="legacy-report-grid" />,
}));
jest.mock("@/components/members/MemberReportGroups", () => ({
  MemberReportGroups: () => <div data-testid="grouped-report-list" />,
}));

import Page from "@/app/(member)/member/reports/page";

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ normalizedEmail: "casey@example.com" });
  mockResolveIdentity.mockResolvedValue({
    members: [{ respondentId: "respondent-1" }],
  });
  mockList.mockResolvedValue({
    reports: [{ submissionId: "submission-1" }],
    groups: [{ campaignId: "campaign-1" }],
    hasOpenEvaluations: false,
  });
});

describe("member reports page grouping flag", () => {
  it("keeps the legacy grid when grouping is disabled", async () => {
    mockGroupingEnabled.mockReturnValue(false);
    render((await Page()) as React.ReactElement);

    expect(screen.getByTestId("legacy-report-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-report-list")).toBeNull();
  });

  it("renders campaign groups when grouping is enabled", async () => {
    mockGroupingEnabled.mockReturnValue(true);
    render((await Page()) as React.ReactElement);

    expect(screen.getByTestId("grouped-report-list")).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-report-grid")).toBeNull();
  });
});
