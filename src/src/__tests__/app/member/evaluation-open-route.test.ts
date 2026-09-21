const mockEnabled = jest.fn(() => true);
const mockMemberSession = jest.fn();

jest.mock("next/server", () => ({
  NextResponse: class extends Response {
    static redirect(url: URL | string, status = 307) {
      return {
        status,
        headers: new Headers({
          location: String(url),
          "cache-control": "no-store",
        }),
        body: null,
        text: async () => "",
      };
    }
  },
}));
jest.mock("@/lib/members/flags", () => ({ isMemberPortalEnabled: () => mockEnabled() }));
jest.mock("@/lib/members/session", () => ({ getMemberSession: () => mockMemberSession() }));
jest.mock("@/lib/assessments/invitation-cookie", () => {
  const state = {
    invitationId: undefined,
    campaignAlias: undefined,
    expiresAt: undefined,
    save: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __sessionState: state,
    getInvitationSession: jest.fn().mockResolvedValue(state),
  };
});

jest.mock("@/lib/db", () => {
  const invitation = {
    id: "inv-own",
    campaignId: "campaign-1",
    respondentId: "member-1",
    tokenHash: "original-token-hash",
    status: "SENT",
    expiresAt: new Date("2026-10-10T00:00:00.000Z"),
    sentAt: new Date("2026-09-20T00:00:00.000Z"),
    submittedAt: null,
    revokedAt: null,
    resentCount: 2,
    lastResentAt: new Date("2026-09-21T00:00:00.000Z"),
    createdAt: new Date("2026-09-19T00:00:00.000Z"),
    stableTokenSequence: 2,
    stableFallbackTokenHash: "fallback-token-hash",
    stableFallbackExpiresAt: new Date("2026-10-09T00:00:00.000Z"),
    stableFallbackTokenSequence: 1,
    campaign: {
      id: "campaign-1",
      alias: "leadership-alignment",
      status: "ACTIVE",
      openAt: new Date("2026-09-01T00:00:00.000Z"),
      closeAt: new Date("2026-10-09T00:00:00.000Z"),
      deletedAt: null,
    },
  };
  const tokenCreate = jest.fn();
  const tx = {
    orgRespondent: {
      findMany: jest.fn().mockResolvedValue([
        { id: "member-1", organizationId: "org-1", teamId: null, roleType: "ceofounder" },
      ]),
    },
    assessmentInvitation: {
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: { data: { status: string } }) => {
        invitation.status = data.status;
        return { id: invitation.id };
      }),
    },
    assessmentInvitationToken: { create: tokenCreate },
  };
  return {
    __invitation: invitation,
    __tx: tx,
    __tokenCreate: tokenCreate,
    db: {
      $transaction: jest.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)),
    },
  };
});

const invitationSession = (
  jest.requireMock("@/lib/assessments/invitation-cookie") as {
    __sessionState: {
      invitationId?: string;
      campaignAlias?: string;
      expiresAt?: string;
      save: jest.Mock;
    };
  }
).__sessionState;

const dbMock = jest.requireMock("@/lib/db") as {
  __invitation: {
    id: string;
    respondentId: string;
    tokenHash: string;
    status: string;
    expiresAt: Date;
    revokedAt: Date | null;
    resentCount: number;
    lastResentAt: Date | null;
    stableTokenSequence: number;
    stableFallbackTokenHash: string | null;
    campaign: {
      status: string;
      openAt: Date;
      closeAt: Date | null;
      deletedAt: Date | null;
    };
  };
  __tx: {
    orgRespondent: { findMany: jest.Mock };
    assessmentInvitation: { findUnique: jest.Mock; update: jest.Mock };
  };
  __tokenCreate: jest.Mock;
};
const invitation = dbMock.__invitation;
const tx = dbMock.__tx;
const tokenCreate = dbMock.__tokenCreate;

import { GET } from "@/app/(member)/member/evaluations/[invitationId]/open/route";

const routeParams = (invitationId = "inv-own") => ({
  params: Promise.resolve({ invitationId }),
});

function request() {
  return new Request("https://example.test/member/evaluations/inv-own/open");
}

function resetInvitation() {
  invitation.status = "SENT";
  invitation.revokedAt = null;
  invitation.expiresAt = new Date("2026-10-10T00:00:00.000Z");
  invitation.campaign.status = "ACTIVE";
  invitation.campaign.openAt = new Date("2026-09-01T00:00:00.000Z");
  invitation.campaign.closeAt = new Date("2026-10-09T00:00:00.000Z");
  invitation.campaign.deletedAt = null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  resetInvitation();
  mockEnabled.mockReturnValue(true);
  mockMemberSession.mockResolvedValue({
    normalizedEmail: "member@example.com",
    issuedAt: "2026-10-01T00:00:00.000Z",
  });
  tx.assessmentInvitation.findUnique.mockResolvedValue(invitation);
  invitationSession.invitationId = undefined;
  invitationSession.campaignAlias = undefined;
  invitationSession.expiresAt = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("GET member evaluation handoff", () => {
  it("grants the existing invitation session and redirects without minting or rotating", async () => {
    const tokenStateBefore = {
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt.toISOString(),
      resentCount: invitation.resentCount,
      lastResentAt: invitation.lastResentAt?.toISOString(),
      stableTokenSequence: invitation.stableTokenSequence,
      stableFallbackTokenHash: invitation.stableFallbackTokenHash,
    };

    const response = await GET(request(), routeParams());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.test/org-survey/leadership-alignment",
    );
    expect(response.body).toBeNull();
    expect(invitationSession).toMatchObject({
      invitationId: "inv-own",
      campaignAlias: "leadership-alignment",
      expiresAt: "2026-10-10T00:00:00.000Z",
    });
    expect(invitationSession.save).toHaveBeenCalledTimes(1);
    expect(tx.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-own" },
      data: { status: "VIEWED" },
    });
    expect(tokenCreate).not.toHaveBeenCalled();
    expect({
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt.toISOString(),
      resentCount: invitation.resentCount,
      lastResentAt: invitation.lastResentAt?.toISOString(),
      stableTokenSequence: invitation.stableTokenSequence,
      stableFallbackTokenHash: invitation.stableFallbackTokenHash,
    }).toEqual(tokenStateBefore);
  });

  it("404s without a member session or for a colleague's invitation", async () => {
    mockMemberSession.mockResolvedValueOnce({});
    expect((await GET(request(), routeParams())).status).toBe(404);
    expect(tx.assessmentInvitation.findUnique).not.toHaveBeenCalled();

    tx.assessmentInvitation.findUnique.mockResolvedValueOnce({
      ...invitation,
      respondentId: "colleague",
    });
    expect((await GET(request(), routeParams())).status).toBe(404);
    expect(invitationSession.save).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked", () => { invitation.revokedAt = new Date("2026-09-30T00:00:00.000Z"); }],
    ["expired", () => { invitation.expiresAt = new Date("2026-10-01T11:59:59.000Z"); }],
    ["submitted", () => { invitation.status = "SUBMITTED"; }],
    ["campaign inactive", () => { invitation.campaign.status = "CLOSED"; }],
    ["not yet open", () => { invitation.campaign.openAt = new Date("2026-10-02T00:00:00.000Z"); }],
    ["campaign close passed", () => { invitation.campaign.closeAt = new Date("2026-10-01T11:59:59.000Z"); }],
    ["campaign deleted", () => { invitation.campaign.deletedAt = new Date("2026-09-30T00:00:00.000Z"); }],
  ])("refuses %s before granting or changing state", async (_case, configure) => {
    configure();
    const statusBefore = invitation.status;

    const response = await GET(request(), routeParams());

    expect(response.status).toBe(404);
    expect(invitation.status).toBe(statusBefore);
    expect(tx.assessmentInvitation.update).not.toHaveBeenCalled();
    expect(invitationSession.save).not.toHaveBeenCalled();
    expect(tokenCreate).not.toHaveBeenCalled();
  });

  it("404s with no side effects while the member portal is disabled", async () => {
    mockEnabled.mockReturnValue(false);
    const response = await GET(request(), routeParams());
    expect(response.status).toBe(404);
    expect(tx.orgRespondent.findMany).not.toHaveBeenCalled();
  });
});
