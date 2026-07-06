/**
 * Wave V (V-3) — "Imported from Esperto (historical)" badge on all three
 * surfaces: respondent reports (scored + qualitative), the group-report
 * cover, and the campaign-detail header.
 *
 * Fail-closed: isImported absent/false → NO badge, output unchanged.
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

import { ImportedBadge } from "@/components/assessments/ImportedBadge";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import { GroupReportCover } from "@/components/assessments/GroupReport";
import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const BADGE_COPY = /Imported from Esperto \(historical\)/;

// ── Respondent report fixture (mirrors reports.wave-u.test.tsx) ──────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "John CEOExec",
    jobTitle: "CEO",
    companyName: "Northwind Logistics",
    assessmentName: "Walk Instrument",
    templateAlias: "some-scored-template",
    campaignLabel: null,
    submittedAt: new Date("2026-07-05T10:00:00Z"),
    result: {
      perQuestion: [
        { stableKey: "Q1", label: "Q One", value: 2, achieved: true },
      ],
      perSection: [
        { stableKey: "S1", name: "General", averagePoints: 2, totalPoints: 2 },
      ],
      overallTotal: 2,
      overallAverage: 2,
      countAchieved: 1,
      tier: null,
      tierMetricValue: 2,
      unansweredKeys: [],
    } as unknown as ScoreResult,
    sections: [{ stableKey: "S1", name: "General" }],
    questionByKey: {},
    questionsByKey: {
      Q1: { type: "SLIDER_LIKERT", label: "Q One", sectionStableKey: "S1" },
    },
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-1",
      contentHash: "abc123",
      templateName: "Walk Instrument",
    },
    degraded: false,
    ...overrides,
  };
}

// ── Campaign detail fixture (mirrors campaign-detail-band-pills) ─────────

function makeOverview(isImported?: boolean): CampaignOverview {
  return {
    campaign: {
      id: "camp-1",
      name: "Imported Year 1",
      alias: "walk-import",
      status: "CLOSED",
      templateId: "tpl-1",
      templateName: "Scaling Up Full",
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: new Date("2025-01-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
      ...(isImported === undefined ? {} : { isImported }),
    },
    stats: {
      totalParticipants: 0,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    },
  };
}

const NO_ROWS: CampaignRespondentRow[] = [];

// ── Tests ────────────────────────────────────────────────────────────────

describe("ImportedBadge", () => {
  it("renders the canonical copy", () => {
    render(<ImportedBadge />);
    expect(screen.getByText(BADGE_COPY)).toBeInTheDocument();
    expect(screen.getByTestId("imported-badge")).toBeInTheDocument();
  });
});

describe("BrandedReport badge", () => {
  it("shows the badge when report.isImported", () => {
    render(<BrandedReport report={baseReport({ isImported: true })} />);
    expect(screen.getByText(BADGE_COPY)).toBeInTheDocument();
  });

  it("no badge when isImported is false or absent", () => {
    const { unmount } = render(<BrandedReport report={baseReport({ isImported: false })} />);
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
    unmount();
    render(<BrandedReport report={baseReport()} />);
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
  });
});

describe("QualitativeReport badge", () => {
  it("shows the badge when report.isImported", () => {
    render(<QualitativeReport report={baseReport({ isImported: true })} />);
    expect(screen.getByText(BADGE_COPY)).toBeInTheDocument();
  });

  it("no badge when absent", () => {
    render(<QualitativeReport report={baseReport()} />);
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
  });
});

describe("GroupReportCover badge", () => {
  const coverProps = {
    assessmentName: "Scaling Up Full",
    companyName: "Acme Corp",
    generatedAt: new Date("2026-07-06T00:00:00Z"),
    coachLogoUrl: null,
    coachName: null,
  };

  it("shows the badge when isImported", () => {
    render(<GroupReportCover {...coverProps} isImported />);
    expect(screen.getByText(BADGE_COPY)).toBeInTheDocument();
  });

  it("no badge when absent", () => {
    render(<GroupReportCover {...coverProps} />);
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
  });
});

describe("CampaignDetail header badge", () => {
  it("shows the badge when overview.campaign.isImported", () => {
    render(
      <CampaignDetail initialOverview={makeOverview(true)} initialRespondents={NO_ROWS} />,
    );
    expect(screen.getByText(BADGE_COPY)).toBeInTheDocument();
  });

  it("no badge when false or absent (fail-closed)", () => {
    const { unmount } = render(
      <CampaignDetail initialOverview={makeOverview(false)} initialRespondents={NO_ROWS} />,
    );
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
    unmount();
    render(
      <CampaignDetail initialOverview={makeOverview()} initialRespondents={NO_ROWS} />,
    );
    expect(screen.queryByText(BADGE_COPY)).toBeNull();
  });
});
