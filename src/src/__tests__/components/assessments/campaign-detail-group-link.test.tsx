/**
 * CampaignDetail — gated "View group report" entry point (Wave F #22, T10).
 *
 * The group report is a bulk-PII surface (claudex R3-M2). The entry point on
 * the coach's CampaignDetail header is:
 *   (a) GATED — rendered only when the server passes `canViewGroupReport=true`
 *       (the page computes accessMode==="INVITED" && isGroupReportEnabled &&
 *       canViewGroupReport server-side; the client receives ONLY the boolean).
 *   (b) NON-PREFETCHING — a plain <a> (NOT a Next <Link>), so Next.js never
 *       pre-fetches the report (which would trigger the loader + a
 *       GROUP_REPORT_VIEW audit) before an explicit click.
 *
 * Tests:
 *  1. capability=true → a "View group report" link renders, plain <a>,
 *     href = /assessments/<id>/report.
 *  2. capability=false → NO group-report link.
 *  3. capability undefined (fail-closed default) → NO group-report link.
 *  4. No-prefetch regression: rendering does NOT issue any fetch / network
 *     call to the group route on mount (no eager load → no audit). The link
 *     is a raw <a> with no Next prefetch behaviour.
 *
 * Reuses the fixture/mocking style from campaign-detail-view-report.test.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

// ─── Helpers ──────────────────────────────────────────────────────────────

const CAMPAIGN_ID = "camp-grp-1";
const GROUP_REPORT_TESTID = "campaign-detail-view-group-report";
const GROUP_REPORT_HREF = `/assessments/${CAMPAIGN_ID}/report`;

function makeOverview(): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "Group Report Test Campaign",
      alias: "group-report-test",
      status: "ACTIVE",
      templateId: "tpl-1",
      templateName: "QSP",
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: new Date("2026-06-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-05-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
    },
    stats: {
      totalParticipants: 1,
      invited: 0,
      viewed: 0,
      submitted: 1,
      completionPct: 100,
    },
  };
}

const NOW = new Date("2026-06-05T10:00:00Z");
const EXPIRES = new Date("2026-07-05T10:00:00Z");

const SUBMITTED_ROW: CampaignRespondentRow = {
  participantId: "part-done",
  respondent: {
    id: "resp-done",
    firstName: "User",
    lastName: "Done",
    email: "done@test.com",
    jobTitle: null,
  },
  teamSnapshot: { pathIds: [], pathLabels: [] },
  invitation: {
    id: "inv-done",
    status: "SUBMITTED",
    sentAt: NOW,
    submittedAt: NOW,
    expiresAt: EXPIRES,
    revokedAt: null,
    resentCount: 0,
  },
  hasSubmission: true,
  submissionId: "sub-done",
  submittedAt: new Date("2026-06-10T12:00:00Z"),
  isCEO: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe("CampaignDetail — gated group-report entry point (Wave F #22, T10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders a 'View group report' link when canViewGroupReport=true (plain anchor, href=/assessments/<id>/report)", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
        canViewGroupReport
        groupReportHref={GROUP_REPORT_HREF}
      />,
    );

    const link = screen.getByTestId(GROUP_REPORT_TESTID);

    // R3-M2: must be a raw <a>, NOT a prefetching Next <Link>.
    expect(link.tagName).toBe("A");
    expect(link).not.toHaveAttribute("data-prefetch");

    expect(link).toHaveAttribute("href", GROUP_REPORT_HREF);
    expect(link.getAttribute("href")).toMatch(/\/assessments\/[^/]+\/report$/);
    expect(link).toHaveTextContent(/view group report/i);
  });

  it("does NOT render the group-report link when canViewGroupReport=false", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
        canViewGroupReport={false}
        groupReportHref={GROUP_REPORT_HREF}
      />,
    );

    expect(screen.queryByTestId(GROUP_REPORT_TESTID)).toBeNull();
  });

  it("fail-closed: does NOT render the group-report link when the capability prop is absent", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
      />,
    );

    expect(screen.queryByTestId(GROUP_REPORT_TESTID)).toBeNull();
  });

  it("no-prefetch regression: rendering does NOT issue any network call to the group route on mount (no eager load → no audit)", () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
        canViewGroupReport
        groupReportHref={GROUP_REPORT_HREF}
      />,
    );

    // The link exists…
    const link = screen.getByTestId(GROUP_REPORT_TESTID);
    expect(link.tagName).toBe("A");

    // …but the report route is NEVER fetched/prefetched on render. A Next
    // <Link> would schedule a prefetch of the href; a plain <a> never does.
    expect(fetchSpy).not.toHaveBeenCalled();
    const calledWithGroupRoute = fetchSpy.mock.calls.some((call) =>
      String(call[0] ?? "").includes(GROUP_REPORT_HREF),
    );
    expect(calledWithGroupRoute).toBe(false);

    // Defense-in-depth: a plain anchor carries no Next prefetch markers.
    expect(link).not.toHaveAttribute("data-prefetch");
  });
});
