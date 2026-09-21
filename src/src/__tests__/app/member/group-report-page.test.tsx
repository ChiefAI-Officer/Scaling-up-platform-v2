import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockSession = jest.fn();
const mockView = jest.fn();

jest.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));
jest.mock("@/lib/members/flags", () => ({ isMemberPortalEnabled: () => true }));
jest.mock("@/lib/members/session", () => ({ getMemberSession: () => mockSession() }));
jest.mock("@/lib/assessments/member-report-gate", () => ({
  viewMemberGroupReport: (...args: unknown[]) => mockView(...args),
}));
jest.mock("@/lib/assessments/report-access-gate-deps", () => ({
  defaultReportGateDeps: () => ({ marker: "deps" }),
}));
jest.mock("@/components/assessments/GroupReport", () => ({
  GroupReport: ({ companyName }: { companyName: string }) => (
    <div data-testid="member-group-report">{companyName}</div>
  ),
  GroupReportEmpty: () => <div data-testid="group-report-empty">No completed submissions yet</div>,
}));
jest.mock("@/components/assessments/PrintReportButton", () => ({
  PrintReportButton: () => <button type="button">Print</button>,
}));
jest.mock("@/lib/mobile-responsive-flags", () => ({ isMobileResponsiveEnabled: () => true }));

import Page from "@/app/(member)/member/reports/team/[campaignId]/page";

const props = { params: Promise.resolve({ campaignId: "campaign-1" }) };
const provenance = {
  generatedAt: new Date("2026-09-21T12:00:00Z"),
  completedCount: 2,
  invitedCount: 2,
  versionId: "version-1",
  templateAlias: "leadership-vision-alignment",
  ceoParticipantId: "participant-1",
  contentHash: "hash",
  submissionIds: ["submission-1", "submission-2"],
  companyName: "Acme",
  assessmentName: "Leadership Vision Alignment",
  versionLabel: "lva-v1",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ normalizedEmail: "member@example.com" });
});

describe("member group report page", () => {
  it("404s without a member session", async () => {
    mockSession.mockResolvedValue({});
    await expect(Page(props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockView).not.toHaveBeenCalled();
  });

  it("404s when the loader denies the completed cohort", async () => {
    mockView.mockResolvedValue({ outcome: { kind: "forbidden" }, metricRole: "MEMBER" });
    await expect(Page(props)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the canonical group report and creates generatedAt at the page boundary", async () => {
    mockView.mockResolvedValue({
      outcome: {
        kind: "ok",
        report: {
          reportType: "qualitative",
          respondents: [{ name: "CEO Person", isCEO: true }],
          degraded: false,
        },
        provenance,
      },
      metricRole: "MEMBER",
    });

    const markup = renderToStaticMarkup((await Page(props)) as React.ReactElement);
    expect(markup).toContain('data-testid="member-group-report"');
    expect(markup).toContain("Acme");
    expect(mockView).toHaveBeenCalledWith(
      { marker: "deps" },
      expect.objectContaining({
        normalizedEmail: "member@example.com",
        campaignId: "campaign-1",
        generatedAt: expect.any(Date),
      }),
    );
  });

  it("renders the canonical empty panel", async () => {
    mockView.mockResolvedValue({
      outcome: { kind: "empty", provenance: { ...provenance, completedCount: 0 } },
      metricRole: "MEMBER",
    });
    const markup = renderToStaticMarkup((await Page(props)) as React.ReactElement);
    expect(markup).toContain('data-testid="group-report-empty"');
  });

  it("renders a member-safe unavailable panel for not-applicable assessments", async () => {
    mockView.mockResolvedValue({
      outcome: { kind: "notApplicable", reason: "unsupported-template", templateAlias: "other" },
      metricRole: "MEMBER",
    });
    const markup = renderToStaticMarkup((await Page(props)) as React.ReactElement);
    expect(markup).toContain('data-testid="group-report-not-applicable"');
    expect(markup).not.toMatch(/campaign|respondent|submission/i);
  });
});
