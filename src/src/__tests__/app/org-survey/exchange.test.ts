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

import { POST } from "@/app/(public)/org-survey/[campaignAlias]/exchange/route";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/assessments/invitation-tokens";

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

beforeEach(() => {
  jest.clearAllMocks();
  sessionState.invitationId = undefined;
  sessionState.campaignAlias = undefined;
  sessionState.expiresAt = undefined;
});

describe("POST exchange", () => {
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

  it("410 when now < openAt", async () => {
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
    expect(res.status).toBe(410);
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
