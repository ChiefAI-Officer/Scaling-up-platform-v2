/**
 * Assessment v7.6 — POST /org-survey/[campaignAlias]/exchange.
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

jest.mock("@/lib/assessments/invitation-cookie", () => {
  const state: {
    invitationId: string | undefined;
    campaignAlias: string | undefined;
    expiresAt: string | undefined;
    save: jest.Mock;
  } = {
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

// Late require to access the shared state after jest.mock factory ran.
const sessionState = (
  jest.requireMock("@/lib/assessments/invitation-cookie") as {
    __sessionState: {
      invitationId: string | undefined;
      campaignAlias: string | undefined;
      expiresAt: string | undefined;
      save: jest.Mock;
    };
  }
).__sessionState;

jest.mock("@/lib/db", () => ({
  db: {
    assessmentInvitation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/assessments/wave-j65-flags", () => ({
  isStableInvitationLinksEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/assessments/stable-invitation-tokens", () => ({
  resolveInvitationByStableTokenHash: jest.fn(),
}));

import { POST } from "@/app/(public)/org-survey/[campaignAlias]/exchange/route";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assessments/invitation-tokens";
import { isStableInvitationLinksEnabled } from "@/lib/assessments/wave-j65-flags";
import { resolveInvitationByStableTokenHash } from "@/lib/assessments/stable-invitation-tokens";

const mockIsStableInvitationLinksEnabled = jest.mocked(
  isStableInvitationLinksEnabled,
);
const mockResolveInvitationByStableTokenHash = jest.mocked(
  resolveInvitationByStableTokenHash,
);

function reqWithToken(token: string): Request {
  return new Request("http://localhost/org-survey/demo/exchange", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
  });
}

const aliasParams = (alias: string) => ({
  params: Promise.resolve({ campaignAlias: alias }),
});

function activeInvitation() {
  return {
    id: "inv-1",
    status: "SENT",
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 86_400_000),
    campaign: {
      id: "c1",
      alias: "demo",
      deletedAt: null as Date | null,
      status: "ACTIVE",
      openAt: new Date(Date.now() - 1000),
      closeAt: null as Date | null,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsStableInvitationLinksEnabled.mockReturnValue(false);
  sessionState.invitationId = undefined;
  sessionState.campaignAlias = undefined;
  sessionState.expiresAt = undefined;
});

describe("POST exchange", () => {
  it("exchanges an older sibling reminder link when stable links are enabled", async () => {
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockResolveInvitationByStableTokenHash.mockResolvedValue(
      activeInvitation() as never,
    );

    const res = await POST(
      reqWithToken("older-reminder") as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(204);
    expect(mockIsStableInvitationLinksEnabled).toHaveBeenCalledWith("demo");
    expect(mockResolveInvitationByStableTokenHash).toHaveBeenCalledWith(
      db,
      hashToken("older-reminder"),
    );
    expect(db.assessmentInvitation.findUnique).not.toHaveBeenCalled();
    expect(sessionState.invitationId).toBe("inv-1");
  });

  it("uses the stable resolver's parent fallback for a manual Resend link", async () => {
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockResolveInvitationByStableTokenHash.mockResolvedValue(
      activeInvitation() as never,
    );

    const res = await POST(
      reqWithToken("manual-resend") as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(204);
    expect(mockResolveInvitationByStableTokenHash).toHaveBeenCalledWith(
      db,
      hashToken("manual-resend"),
    );
    expect(db.assessmentInvitation.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.revokedAt = new Date();
    }, 410],
    ["expired", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.expiresAt = new Date(Date.now() - 1000);
    }, 410],
    ["submitted", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.status = "SUBMITTED";
    }, 410],
    ["campaign closed", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.campaign.status = "CLOSED";
    }, 410],
    ["campaign close date passed", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.campaign.closeAt = new Date(Date.now() - 1000);
    }, 410],
    ["campaign soft deleted", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.campaign.deletedAt = new Date();
    }, 410],
    ["campaign alias does not match", (invitation: ReturnType<typeof activeInvitation>) => {
      invitation.campaign.alias = "different";
    }, 404],
  ])("keeps the %s lifecycle result for enabled sibling links", async (_case, configure, expectedStatus) => {
    const invitation = activeInvitation();
    configure(invitation);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockResolveInvitationByStableTokenHash.mockResolvedValue(invitation as never);

    const res = await POST(
      reqWithToken("older-reminder") as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(expectedStatus);
    expect(mockResolveInvitationByStableTokenHash).toHaveBeenCalledWith(
      db,
      hashToken("older-reminder"),
    );
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("returns the existing generic 404 without logging or returning an unknown raw token", async () => {
    const rawToken = "unknown-sibling-token";
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockResolveInvitationByStableTokenHash.mockResolvedValue(null);

    const res = await POST(reqWithToken(rawToken) as never, aliasParams("demo"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: "Invitation not found",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each(["default off", "kill switch"])(
    "keeps the parent-only lookup when stable links are %s",
    async () => {
      const parentInvitation = activeInvitation();
      mockIsStableInvitationLinksEnabled.mockReturnValue(false);
      (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
        parentInvitation,
      );

      const res = await POST(
        reqWithToken("newest-parent-token") as never,
        aliasParams("demo"),
      );

      expect(res.status).toBe(204);
      expect(mockResolveInvitationByStableTokenHash).not.toHaveBeenCalled();
      expect(db.assessmentInvitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken("newest-parent-token") },
        include: {
          campaign: {
            select: {
              id: true,
              alias: true,
              status: true,
              openAt: true,
              closeAt: true,
              deletedAt: true,
            },
          },
        },
      });
    },
  );

  it("404 when token does not match any invitation", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(reqWithToken("garbage") as never, aliasParams("demo"));
    expect(res.status).toBe(404);
  });

  it("404 when alias mismatch (token belongs to a different campaign)", async () => {
    const future = new Date(Date.now() + 86_400_000);
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      tokenHash: hashToken("t"),
      status: "SENT",
      revokedAt: null,
      expiresAt: future,
      campaign: {
        id: "c1",
        alias: "DIFFERENT",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(404);
  });

  it("410 when revokedAt is set", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(410);
  });

  it("410 when now > expiresAt", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(410);
  });

  it("410 when status SUBMITTED", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SUBMITTED",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(410);
  });

  it("410 when campaign is CLOSED", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "CLOSED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(410);
  });

  it("425 when now < openAt", async () => {
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() + 86_400_000),
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(425);
  });

  it("VIEWED monotonicity: flips PENDING/SENT → VIEWED, leaves VIEWED alone", async () => {
    const baseRow = {
      id: "inv-1",
      status: "PENDING" as const,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
      },
    };
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValueOnce(baseRow);
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(204);
    expect(db.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "VIEWED" },
    });

    // Already-VIEWED: no update call.
    (db.assessmentInvitation.update as jest.Mock).mockClear();
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValueOnce({
      ...baseRow,
      status: "VIEWED",
    });
    const res2 = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res2.status).toBe(204);
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });
});
