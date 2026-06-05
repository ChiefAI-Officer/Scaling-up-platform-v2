/**
 * CampaignDetail — branded "View report" is the PRIMARY results action (Task 5, Phase 1).
 *
 * Tests:
 *  1. A SUBMITTED respondent row renders a "View report" link:
 *       - it is a plain <a> (tagName ANCHOR), NOT a prefetching Next <Link>
 *       - href ends with /assessments/<campaignId>/respondents/<respondentId>/report
 *       - target="_blank" and rel contains "noopener"
 *  2. A respondent WITHOUT a submission → no "View report" link.
 *  3. The inline raw view affordance still exists (de-emphasized) — Phase 1 keeps it.
 *
 * Reuses the fixture/mocking style from campaign-detail-band-pills.test.tsx.
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
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

const CAMPAIGN_ID = "camp-1";

function makeOverview(): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "View Report Test Campaign",
      alias: "view-report-test",
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

function respondentRow(
  id: string,
  invitation: CampaignRespondentRow["invitation"],
  hasSubmission = false,
): CampaignRespondentRow {
  return {
    participantId: `part-${id}`,
    respondent: {
      id: `resp-${id}`,
      firstName: "User",
      lastName: id,
      email: `${id}@test.com`,
      jobTitle: null,
    },
    teamSnapshot: { pathIds: [], pathLabels: [] },
    invitation,
    hasSubmission,
    submissionId: hasSubmission ? `sub-${id}` : null,
    submittedAt: hasSubmission ? new Date("2026-06-10T12:00:00Z") : null,
    isCEO: false,
  };
}

const EXPIRES = new Date("2026-07-05T10:00:00Z");

const SUBMITTED_ROW = respondentRow(
  "done",
  {
    id: "inv-done",
    status: "SUBMITTED",
    sentAt: NOW,
    submittedAt: NOW,
    expiresAt: EXPIRES,
    revokedAt: null,
    resentCount: 0,
  },
  true,
);

const NOT_SUBMITTED_ROW = respondentRow(
  "pending",
  {
    id: "inv-pending",
    status: "SENT",
    sentAt: NOW,
    submittedAt: null,
    expiresAt: EXPIRES,
    revokedAt: null,
    resentCount: 0,
  },
  false,
);

// ─── Tests ────────────────────────────────────────────────────────────────

describe("CampaignDetail — View report is the primary results action (Task 5, Phase 1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders a 'View report' link for a SUBMITTED respondent as a plain new-tab anchor", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
      />,
    );

    const link = screen.getByTestId(
      `view-report-link-${SUBMITTED_ROW.respondent.id}`,
    );

    // H6: must be a raw <a>, NOT a prefetching Next <Link>.
    expect(link.tagName).toBe("A");
    // A real Next <Link> would not exist as a raw anchor with no prefetch behaviour;
    // assert the anchor is not flagged as a prefetch link.
    expect(link).not.toHaveAttribute("data-prefetch");

    expect(link).toHaveAttribute(
      "href",
      `/assessments/${CAMPAIGN_ID}/respondents/${SUBMITTED_ROW.respondent.id}/report`,
    );
    expect(link.getAttribute("href")).toMatch(
      /\/assessments\/[^/]+\/respondents\/[^/]+\/report$/,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");

    expect(link).toHaveTextContent(/view report/i);
  });

  it("does NOT render a 'View report' link for a respondent without a submission", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[NOT_SUBMITTED_ROW]}
      />,
    );

    expect(
      screen.queryByTestId(
        `view-report-link-${NOT_SUBMITTED_ROW.respondent.id}`,
      ),
    ).toBeNull();
  });

  it("keeps the inline raw-data view affordance (de-emphasized) for a SUBMITTED respondent (Phase 1)", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
      />,
    );

    // The old inline-toggle button is still present in Phase 1 (kept as fallback).
    const rawToggle = screen.getByTestId(
      `view-result-btn-${SUBMITTED_ROW.respondent.id}`,
    );
    expect(rawToggle).toBeInTheDocument();

    // De-emphasized: it is a <button>, not the primary anchor, and labelled as raw data.
    expect(rawToggle.tagName).toBe("BUTTON");
    expect(rawToggle).toHaveTextContent(/raw data/i);
  });

  it("renders the report link AND the raw-data toggle together inside the actions cell", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[SUBMITTED_ROW]}
      />,
    );

    const row = screen.getByTestId(
      `respondent-row-${SUBMITTED_ROW.respondent.id}`,
    );
    expect(
      within(row).getByTestId(`view-report-link-${SUBMITTED_ROW.respondent.id}`),
    ).toBeInTheDocument();
    expect(
      within(row).getByTestId(`view-result-btn-${SUBMITTED_ROW.respondent.id}`),
    ).toBeInTheDocument();
  });
});
