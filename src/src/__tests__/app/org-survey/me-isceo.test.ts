/**
 * Wave J-1 — GET /org-survey/[campaignAlias]/me must surface `isCEO`.
 *
 * The CEO answers the SU-Full S_BACKGROUND FTE questions and sees the
 * growth-phase interstitial; team members must not. The flag comes from the
 * respondent's AssessmentCampaignParticipant row (isCEO), keyed by the
 * invitation's campaignId + respondentId.
 */

jest.mock("next/server", () => ({
  NextResponse: class extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      });
    }
  },
}));

// `var` hoists with jest.mock — `const` does not.
// eslint-disable-next-line no-var
var sessionState: {
  invitationId: string | undefined;
  campaignAlias: string | undefined;
} = { invitationId: undefined, campaignAlias: undefined };

jest.mock("@/lib/assessments/invitation-cookie", () => ({
  getInvitationSession: jest.fn(() => Promise.resolve(sessionState)),
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentInvitation: { findUnique: jest.fn() },
    assessmentCampaignParticipant: { findUnique: jest.fn() },
  },
}));

import { GET } from "@/app/(public)/org-survey/[campaignAlias]/me/route";
import { db } from "@/lib/db";

function req(): Request {
  return new Request("http://localhost/org-survey/demo/me", { method: "GET" });
}
const aliasParams = (alias: string) => ({
  params: Promise.resolve({ campaignAlias: alias }),
});

function mockLiveInvitation() {
  (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
    id: "inv-1",
    campaignId: "c1",
    respondentId: "r1",
    status: "VIEWED",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    campaign: {
      id: "c1",
      name: "Demo",
      alias: "demo",
      deletedAt: null,
      status: "ACTIVE",
      openAt: new Date(Date.now() - 1000),
      closeAt: null,
      template: { alias: "scaling-up-full" },
      version: { id: "v1", language: "en", questions: [], sections: [] },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionState.invitationId = "inv-1";
  sessionState.campaignAlias = "demo";
});

describe("GET me — isCEO", () => {
  it("returns isCEO=true when the participant row is flagged CEO", async () => {
    mockLiveInvitation();
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
      isCEO: true,
    });
    const res = await GET(req() as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { isCEO: boolean } };
    expect(body.data.isCEO).toBe(true);
  });

  it("returns isCEO=false when the participant is not the CEO", async () => {
    mockLiveInvitation();
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue({
      isCEO: false,
    });
    const res = await GET(req() as never, aliasParams("demo"));
    const body = (await res.json()) as { data: { isCEO: boolean } };
    expect(body.data.isCEO).toBe(false);
  });

  it("defaults isCEO=false when there is no participant row (fail-safe)", async () => {
    mockLiveInvitation();
    (db.assessmentCampaignParticipant.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await GET(req() as never, aliasParams("demo"));
    const body = (await res.json()) as { data: { isCEO: boolean } };
    expect(body.data.isCEO).toBe(false);
  });
});
