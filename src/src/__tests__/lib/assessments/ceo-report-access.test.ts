const mockGetCeoReportAccessSession = jest.fn();

jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("iron-session", () => ({ getIronSession: jest.fn() }));
jest.mock("@/lib/assessments/ceo-report-access-cookie", () => ({
  ...jest.requireActual("@/lib/assessments/ceo-report-access-cookie"),
  getCeoReportAccessSession: (...args: unknown[]) => mockGetCeoReportAccessSession(...args),
}));
jest.mock("@/lib/db", () => ({ db: {} }));

import {
  authorizeCeoReportAccess,
  resolveCeoViewerFromExactPathSession,
} from "@/lib/assessments/ceo-report-access";
import { buildCeoReportSessionOptions } from "@/lib/assessments/ceo-report-access-cookie";
import type { CeoReportAccessClaims } from "@/lib/assessments/ceo-report-access-token";

const mockDb = jest.requireMock("@/lib/db").db as Record<string, unknown>;

const claims: CeoReportAccessClaims = {
  version: 1,
  purpose: "assessment-report-comparison-self",
  focusCampaignId: "campaign-1",
  invitationId: "invite-1",
  respondentId: "respondent-1",
  expiresAt: 1_900_000_000,
};

function liveInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    campaignId: "campaign-1",
    respondentId: "respondent-1",
    status: "SUBMITTED",
    revokedAt: null,
    submission: {
      id: "submission-1",
      campaignId: "campaign-1",
      respondentId: "respondent-1",
      invitationId: "invite-1",
      submittedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    campaign: {
      id: "campaign-1",
      organizationId: "organization-1",
      templateId: "template-1",
      deletedAt: null,
      accessMode: "INVITED",
      showResultsOnScreen: true,
      sendResultsToRespondent: false,
      template: { alias: "scaling-up-full" },
      organization: { id: "organization-1", deletedAt: null },
    },
    respondent: { id: "respondent-1", organizationId: "organization-1", deletedAt: null },
    participant: { campaignId: "campaign-1", respondentId: "respondent-1", isCEO: true },
    ...overrides,
  };
}

function accessDb(invitation: ReturnType<typeof liveInvitation> | null) {
  const tx = {
    assessmentInvitation: { findFirst: jest.fn().mockResolvedValue(invitation) },
    assessmentCampaignParticipant: {
      findFirst: jest.fn().mockResolvedValue(invitation?.participant ?? null),
    },
  };
  return {
    $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
    tx,
  };
}

describe("CEO self report access", () => {
  beforeEach(() => {
    process.env.ASSESSMENT_REPORT_ACCESS_SECRET = "test-secret-at-least-thirty-two-characters";
    process.env.WAVE_RC_REPORT_COMPARISON_ENABLED = "1";
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
    delete process.env.WAVE_RC_REPORT_COMPARISON_ENABLED;
    delete process.env.WAVE_RC_REPORT_COMPARISON_KILL;
  });

  test("seals the resolved submission into an exact, encoded report path cookie", () => {
    expect(buildCeoReportSessionOptions("campaign / 1", "respondent / 1")).toMatchObject({
      cookieName: "assessment-report-self",
      cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/assessments/campaign%20%2F%201/respondents/respondent%20%2F%201/report",
      },
    });
  });

  test("authorizes a token-bound completed CEO invitation and resolves its server-side submission", async () => {
    const fixture = accessDb(liveInvitation());

    await expect(authorizeCeoReportAccess(fixture as never, claims)).resolves.toEqual({
      focusCampaignId: "campaign-1",
      focusSubmissionId: "submission-1",
      invitationId: "invite-1",
      respondentId: "respondent-1",
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    });
    expect(fixture.$transaction).toHaveBeenCalledTimes(1);
    expect(fixture.tx.assessmentInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "invite-1",
        campaignId: "campaign-1",
        respondentId: "respondent-1",
        status: "SUBMITTED",
      }),
    }));
  });

  test.each([
    ["missing invitation", null],
    ["revoked invitation", liveInvitation({ revokedAt: new Date() })],
    ["non-submitted invitation", liveInvitation({ status: "VIEWED" })],
    ["missing completed submission", liveInvitation({ submission: null })],
    ["submission for a different respondent", liveInvitation({ submission: { id: "submission-1", campaignId: "campaign-1", respondentId: "other", invitationId: "invite-1", submittedAt: new Date() } })],
    ["deleted campaign", liveInvitation({ campaign: { ...liveInvitation().campaign, deletedAt: new Date() } })],
    ["public campaign", liveInvitation({ campaign: { ...liveInvitation().campaign, accessMode: "PUBLIC" } })],
    ["other template", liveInvitation({ campaign: { ...liveInvitation().campaign, template: { alias: "other" } } })],
    ["hidden results", liveInvitation({ campaign: { ...liveInvitation().campaign, showResultsOnScreen: false, sendResultsToRespondent: false } })],
    ["deleted respondent", liveInvitation({ respondent: { id: "respondent-1", organizationId: "organization-1", deletedAt: new Date() } })],
    ["not a current CEO", liveInvitation({ participant: { campaignId: "campaign-1", respondentId: "respondent-1", isCEO: false } })],
  ])("revokes access for %s", async (_reason, invitation) => {
    const fixture = accessDb(invitation as ReturnType<typeof liveInvitation> | null);
    await expect(authorizeCeoReportAccess(fixture as never, claims)).resolves.toBeNull();
  });

  test("revokes access when the campaign organization is soft-deleted", async () => {
    const fixture = accessDb(liveInvitation({
      campaign: {
        ...liveInvitation().campaign,
        organization: {
          id: "organization-1",
          deletedAt: new Date("2026-08-05T00:00:00.000Z"),
        },
      },
    }));

    await expect(authorizeCeoReportAccess(fixture as never, claims)).resolves.toBeNull();
  });

  test("revokes access when the comparison flag is killed", async () => {
    const fixture = accessDb(liveInvitation());
    process.env.WAVE_RC_REPORT_COMPARISON_KILL = "1";
    await expect(authorizeCeoReportAccess(fixture as never, claims)).resolves.toBeNull();
  });

  test("fails closed when the live-record transaction cannot be completed", async () => {
    const unavailableDb = {
      $transaction: jest.fn().mockRejectedValue(new Error("database unavailable")),
    };
    await expect(authorizeCeoReportAccess(unavailableDb as never, claims)).resolves.toBeNull();
  });

  test("does not accept route identifiers unless the exact-path cookie matches and revalidates live access", async () => {
    const fixture = accessDb(liveInvitation());
    Object.assign(mockDb, fixture);
    mockGetCeoReportAccessSession.mockResolvedValue({
      focusCampaignId: "campaign-1",
      focusSubmissionId: "submission-1",
      invitationId: "invite-1",
      respondentId: "respondent-1",
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    });

    await expect(resolveCeoViewerFromExactPathSession("campaign-1", "respondent-1")).resolves.toEqual({
      kind: "ceo-self",
      focusCampaignId: "campaign-1",
      focusSubmissionId: "submission-1",
      respondentId: "respondent-1",
    });

    mockGetCeoReportAccessSession.mockResolvedValue({
      focusCampaignId: "campaign-1",
      focusSubmissionId: "submission-1",
      invitationId: "invite-1",
      respondentId: "other-respondent",
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    });
    await expect(resolveCeoViewerFromExactPathSession("campaign-1", "respondent-1")).resolves.toBeNull();
  });
});
