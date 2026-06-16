/**
 * Wave D — Task 10: TZ fix #2 — exchange route gateNotYetOpen message.
 *
 * Verifies that when a campaign isn't yet open, the error message uses
 * Intl.DateTimeFormat (no raw toLocaleString) and returns the expected
 * code + openAt field for the client to format.
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
});

describe("exchange route — gateNotYetOpen TZ fix", () => {
  it("returns 425 with code=NOT_YET_OPEN and openAt ISO string when campaign not yet open", async () => {
    const futureOpen = new Date(Date.now() + 86_400_000); // tomorrow
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: futureOpen,
        closeAt: null,
      },
    });
    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    expect(res.status).toBe(425);

    const body = await res.json() as {
      success: boolean;
      code: string;
      openAt: string;
      error: string;
    };
    expect(body.code).toBe("NOT_YET_OPEN");
    expect(body.openAt).toBe(futureOpen.toISOString());
    // Error message must contain a formatted date string (not raw toLocaleString)
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // Crucially: the error message should NOT use the raw toLocaleString pattern
    // (we can't easily test the absence of a call, but we verify format is
    // consistent — the error should mention "opens" or the date)
    expect(body.error).toMatch(/opens/i);
  });

  it("error message uses a util-formatted date, not toLocaleString", async () => {
    const futureOpen = new Date("2099-01-15T10:30:00.000Z");
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        openAt: futureOpen,
        closeAt: null,
      },
    });

    const res = await POST(reqWithToken("t") as never, aliasParams("demo"));
    const body = await res.json() as { error: string; code: string };

    // The error must not use toLocaleString undefined locale behavior
    // (which is what the no-inline-tolocaledatestring rule bans).
    // We verify the route now formats via Intl.DateTimeFormat (en-US, dateStyle+timeStyle)
    // by checking the error contains a standard US date format.
    expect(body.code).toBe("NOT_YET_OPEN");

    // The formatted date (via formatTimestampDateTime) should render something like "Jan 15, 2099"
    // Intl.DateTimeFormat en-US with dateStyle:medium gives e.g. "Jan 15, 2099"
    expect(body.error).toMatch(/Jan 15, 2099/i);
  });
});
