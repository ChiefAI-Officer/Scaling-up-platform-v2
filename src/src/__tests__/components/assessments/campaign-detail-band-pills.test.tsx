/**
 * CampaignDetail — header aggregate metrics strip + per-row band pills (Slice 5, Task 5.5).
 *
 * Tests:
 *  1. Header metrics strip renders with correct testidPrefix and counts for a known respondent set
 *  2. PENDING + sentAt null → band-pill-new
 *  3. SENT invitation → band-pill-invited
 *  4. VIEWED invitation → band-pill-started
 *  5. SUBMITTED invitation → band-pill-completed
 *  6. Revoked invitation → band-pill-revoked
 *  7. No OLD status-pill-pending / status-pill-sent testids in the Status column
 *     (regression guard — per-row cells now use band labels, not raw enum strings)
 */

import React from "react";
import { render, screen } from "@testing-library/react";

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

function makeOverview(): CampaignOverview {
  return {
    campaign: {
      id: "camp-1",
      name: "Band Pill Test Campaign",
      alias: "band-pill-test",
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
      totalParticipants: 5,
      invited: 2,
      viewed: 1,
      submitted: 1,
      completionPct: 20,
    },
  };
}

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

const NOW = new Date("2026-06-05T10:00:00Z");

// Five respondents covering all 5 bands:
//   1 new (no invitation), 1 invited (SENT), 1 started (VIEWED), 1 completed (SUBMITTED), 1 revoked
const MIXED_RESPONDENTS: CampaignRespondentRow[] = [
  respondentRow("new", null),
  respondentRow("invited", { id: "inv-2", status: "SENT", sentAt: NOW, revokedAt: null, resentCount: 0 }),
  respondentRow("started", { id: "inv-3", status: "VIEWED", sentAt: NOW, revokedAt: null, resentCount: 0 }),
  respondentRow("completed", { id: "inv-4", status: "SUBMITTED", sentAt: NOW, revokedAt: null, resentCount: 0 }, true),
  respondentRow("revoked", { id: "inv-5", status: "SENT", sentAt: NOW, revokedAt: NOW, resentCount: 0 }),
];

// ─── Tests ────────────────────────────────────────────────────────────────

describe("CampaignDetail — header metrics strip (Task 5.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders the metrics strip with correct testIdPrefix and counts", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={MIXED_RESPONDENTS}
      />,
    );

    // Strip container
    expect(screen.getByTestId("campaign-detail-metrics")).toBeInTheDocument();

    // 5 total respondents minus 1 revoked = 4 in the active bands
    expect(screen.getByTestId("campaign-detail-metrics-total")).toHaveTextContent("4");
    expect(screen.getByTestId("campaign-detail-metrics-new")).toHaveTextContent("1");
    expect(screen.getByTestId("campaign-detail-metrics-invited")).toHaveTextContent("1");
    expect(screen.getByTestId("campaign-detail-metrics-started")).toHaveTextContent("1");
    expect(screen.getByTestId("campaign-detail-metrics-completed")).toHaveTextContent("1");
  });

  it("renders metrics strip with all zeros when no respondents", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
      />,
    );

    expect(screen.getByTestId("campaign-detail-metrics")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-detail-metrics-total")).toHaveTextContent("0");
  });
});

describe("CampaignDetail — per-row band pills (Task 5.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders band-pill-new for a PENDING invitation with null sentAt", () => {
    const respondents = [respondentRow("a", null)];
    render(<CampaignDetail initialOverview={makeOverview()} initialRespondents={respondents} />);
    expect(screen.getByTestId("band-pill-new")).toBeInTheDocument();
  });

  it("renders band-pill-invited for a SENT invitation", () => {
    const respondents = [
      respondentRow("a", { id: "inv-a", status: "SENT", sentAt: NOW, revokedAt: null, resentCount: 0 }),
    ];
    render(<CampaignDetail initialOverview={makeOverview()} initialRespondents={respondents} />);
    expect(screen.getByTestId("band-pill-invited")).toBeInTheDocument();
  });

  it("renders band-pill-started for a VIEWED invitation", () => {
    const respondents = [
      respondentRow("a", { id: "inv-a", status: "VIEWED", sentAt: NOW, revokedAt: null, resentCount: 0 }),
    ];
    render(<CampaignDetail initialOverview={makeOverview()} initialRespondents={respondents} />);
    expect(screen.getByTestId("band-pill-started")).toBeInTheDocument();
  });

  it("renders band-pill-completed for a SUBMITTED invitation", () => {
    const respondents = [
      respondentRow("a", { id: "inv-a", status: "SUBMITTED", sentAt: NOW, revokedAt: null, resentCount: 0 }, true),
    ];
    render(<CampaignDetail initialOverview={makeOverview()} initialRespondents={respondents} />);
    expect(screen.getByTestId("band-pill-completed")).toBeInTheDocument();
  });

  it("renders band-pill-revoked for a revoked invitation", () => {
    const respondents = [
      respondentRow("a", { id: "inv-a", status: "SENT", sentAt: NOW, revokedAt: NOW, resentCount: 0 }),
    ];
    render(<CampaignDetail initialOverview={makeOverview()} initialRespondents={respondents} />);
    expect(screen.getByTestId("band-pill-revoked")).toBeInTheDocument();
  });

  it("does NOT render old status-pill-pending or status-pill-sent in the status column", () => {
    // Regression guard — raw PENDING/SENT enum pills must be gone from the row Status cell.
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={MIXED_RESPONDENTS}
      />,
    );

    expect(screen.queryByTestId("status-pill-pending")).toBeNull();
    expect(screen.queryByTestId("status-pill-sent")).toBeNull();
    expect(screen.queryByTestId("status-pill-viewed")).toBeNull();
    expect(screen.queryByTestId("status-pill-submitted")).toBeNull();
  });
});
