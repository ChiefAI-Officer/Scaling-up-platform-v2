/**
 * Wave Z (Z-2b) — CampaignDetail admin-host props.
 *
 * The component hardcodes `requireCoach()`-guarded portal navigation that
 * dead-ends admin/STAFF (admin→/dashboard, STAFF→/unauthorized). Two new
 * backward-compatible props let the admin campaigns host reuse it safely:
 *   - `basePath` drives the "Back to Assessments" link (default coach portal),
 *   - `hidePortalOnlyLinks` suppresses "View Trends" + the empty-state
 *     "Add members in the Members lane" link (no admin equivalents).
 * (The coach-only per-respondent "Over time" rollback entry is handled
 * separately by the admin page omitting its eligibility prop.)
 *
 * Regression: with no host props, the coach portal behaviour is unchanged.
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

const CAMPAIGN_ID = "camp-admin-1";

function makeOverview(): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "Admin Host Test Campaign",
      alias: "admin-host-test",
      status: "ACTIVE",
      templateId: "tpl-1",
      templateName: "QSP",
      templateAlias: "quarterly-session-prep",
      reportStyle: "CLASSIC",
      reportStyleSource: "TEMPLATE_DEFAULT",
      reportStyleLockedAt: null,
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
    expiresAt: new Date("2026-07-05T10:00:00Z"),
    revokedAt: null,
    resentCount: 0,
  },
  hasSubmission: true,
  submissionId: "sub-done",
  submittedAt: new Date("2026-06-10T12:00:00Z"),
  isCEO: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("CampaignDetail — coach portal defaults (regression)", () => {
  it("Back link targets the coach portal and 'View Trends' renders", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /back to assessments/i }),
    ).toHaveAttribute("href", "/portal/assessments");
    expect(
      screen.getByTestId("campaign-detail-view-trends"),
    ).toBeInTheDocument();
  });
});

describe("CampaignDetail — admin host (Wave Z Z-2b)", () => {
  it("Back link targets the admin campaigns list and portal-only links are suppressed", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
        basePath="/admin/assessments/campaigns"
        hidePortalOnlyLinks
      />,
    );
    // Back → admin list, never /portal/assessments.
    const back = screen.getByRole("link", { name: /back to assessments/i });
    expect(back).toHaveAttribute("href", "/admin/assessments/campaigns");
    // "View Trends" (a /portal/assessments/trends dead-end) is gone.
    expect(
      screen.queryByTestId("campaign-detail-view-trends"),
    ).not.toBeInTheDocument();
    // No stray /portal/* nav link remains in the rendered output.
    const portalLinks = screen
      .queryAllByRole("link")
      .filter((a) => (a.getAttribute("href") ?? "").startsWith("/portal/"));
    expect(portalLinks).toHaveLength(0);
  });
});
