/**
 * Wave J (J-3) — entry-point publish gate on the coach CampaignDetail page.
 *
 * The "View group report" entry link must be hidden for a DRAFT (unpublished)
 * SU-Full campaign EVEN when the flag is on — lock-step with the loader's
 * SU-Full-scoped publish guard. LVA is NEVER gated on publishedAt.
 *
 * Strategy: drive the REAL server component with every leaf mocked, and capture
 * the `canViewGroupReport` boolean the page hands to <CampaignDetail>. We assert
 * ONLY that boolean (the page's whole job for this gate).
 */

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const mockRequireCoach = jest.fn();
jest.mock("@/lib/auth/authorization", () => ({
  requireCoach: () => mockRequireCoach(),
}));

jest.mock("@/lib/auth/access-control", () => ({
  normalizeRole: (r: string) => r,
}));

const mockCanManageCampaign = jest.fn();
const mockCanViewGroupReport = jest.fn();
jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (x: unknown) => x,
  canManageCampaign: (...a: unknown[]) => mockCanManageCampaign(...a),
  canViewGroupReport: (...a: unknown[]) => mockCanViewGroupReport(...a),
}));

jest.mock("@/lib/assessments/campaign-detail", () => ({
  asCampaignDetailDb: (x: unknown) => x,
  getCampaignOverview: jest.fn().mockResolvedValue({ overview: true }),
  getCampaignRespondents: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDCustomHtmlEmailEnabled: () => false,
}));

// NOTE: @/lib/assessments/wave-f-flags is intentionally NOT mocked — the page
// must consult the REAL alias-aware isGroupReportEnabled + isGroupReportAlias;
// enablement is driven via env vars per-test.

const mockFindFirst = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    assessmentCampaign: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
  },
}));

// Capture the props handed to CampaignDetail.
const captured: { canViewGroupReport?: boolean } = {};
jest.mock("@/components/assessments/CampaignDetail", () => ({
  CampaignDetail: (props: { canViewGroupReport?: boolean }) => {
    captured.canViewGroupReport = props.canViewGroupReport;
    return null;
  },
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/(portal)/portal/assessments/[id]/page";

const CAMPAIGN_ID = "camp-1";

function coachSession() {
  return {
    session: {
      user: { id: "user-1", email: "coach@example.com", role: "COACH" },
    },
    coach: { id: "coach-1" },
  };
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    accessMode: "INVITED",
    createdByCoachId: "coach-1",
    organizationId: "org-1",
    template: { alias: "scaling-up-full" },
    version: { publishedAt: new Date("2026-06-01T00:00:00Z") },
    ...overrides,
  };
}

async function runPage() {
  captured.canViewGroupReport = undefined;
  const node = await Page({ params: Promise.resolve({ id: CAMPAIGN_ID }) });
  // Render the returned tree so the (mocked) CampaignDetail is invoked and
  // captures the canViewGroupReport boolean the page computed.
  renderToStaticMarkup(node as React.ReactElement);
  return captured.canViewGroupReport;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireCoach.mockResolvedValue(coachSession());
  mockCanManageCampaign.mockResolvedValue(true);
  mockCanViewGroupReport.mockResolvedValue(true);
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
  delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
  delete process.env.WAVE_J_SUFULL_GROUP_CANARY;
  delete process.env.WAVE_J_SUFULL_GROUP_KILL;
});

afterEach(() => {
  delete process.env.WAVE_J_SUFULL_GROUP_ENABLED;
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
});

describe("CampaignDetail entry-point publish gate (Wave J J-3)", () => {
  it("PUBLISHED SU-Full + WAVE_J on → canViewGroupReport true", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(makeCampaign());
    expect(await runPage()).toBe(true);
  });

  it("DRAFT (unpublished) SU-Full → canViewGroupReport FALSE even with the flag on", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ version: { publishedAt: null } }),
    );
    expect(await runPage()).toBe(false);
  });

  it("SU-Full with WAVE_J off → canViewGroupReport false (flag-gated)", async () => {
    mockFindFirst.mockResolvedValue(makeCampaign());
    expect(await runPage()).toBe(false);
  });

  it("LVA with a NULL publishedAt → still true (publish guard is SU-Full-scoped)", async () => {
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({
        template: { alias: "leadership-vision-alignment" },
        version: { publishedAt: null },
      }),
    );
    expect(await runPage()).toBe(true);
  });

  it("non-allowlisted alias → false regardless of flags", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ template: { alias: "RockHabits" } }),
    );
    expect(await runPage()).toBe(false);
  });

  it("DRAFT SU-Full does not even consult canViewGroupReport (short-circuits on publish)", async () => {
    process.env.WAVE_J_SUFULL_GROUP_ENABLED = "1";
    mockFindFirst.mockResolvedValue(
      makeCampaign({ version: { publishedAt: null } }),
    );
    await runPage();
    expect(mockCanViewGroupReport).not.toHaveBeenCalled();
  });
});
