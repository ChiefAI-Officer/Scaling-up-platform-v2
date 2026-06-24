/**
 * Assessment v7.6 — GET /org-survey/[campaignAlias]/me.
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

// `var` hoists with jest.mock — `const` does not, which causes a
// `ReferenceError: Cannot access 'sessionState' before initialization`
// at test-suite load time.
// eslint-disable-next-line no-var
var sessionState: {
  invitationId: string | undefined;
  campaignAlias: string | undefined;
  expiresAt: string | undefined;
} = {
  invitationId: undefined,
  campaignAlias: undefined,
  expiresAt: undefined,
};

jest.mock("@/lib/assessments/invitation-cookie", () => ({
  // Lazy resolve so the mocked function reads the latest `sessionState`
  // every call (allowing `beforeEach` to reset between tests).
  getInvitationSession: jest.fn(() => Promise.resolve(sessionState)),
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentInvitation: {
      findUnique: jest.fn(),
    },
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

beforeEach(() => {
  jest.clearAllMocks();
  sessionState.invitationId = undefined;
  sessionState.campaignAlias = undefined;
  sessionState.expiresAt = undefined;
});

describe("GET me", () => {
  it("401 when no session", async () => {
    const res = await GET(req() as never, aliasParams("demo"));
    expect(res.status).toBe(401);
  });

  it("410 when lifecycle gate fails (campaign CLOSED)", async () => {
    sessionState.invitationId = "inv-1";
    sessionState.campaignAlias = "demo";
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      status: "VIEWED",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      campaign: {
        id: "c1",
        name: "Demo",
        alias: "demo",
        deletedAt: null,
        status: "CLOSED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        template: { alias: "leadership-vision-alignment" },
        version: {
          id: "v1",
          language: "en",
          questions: [],
          sections: [],
        },
      },
    });
    const res = await GET(req() as never, aliasParams("demo"));
    expect(res.status).toBe(410);
  });

  it("returns sections + questions when lifecycle passes", async () => {
    sessionState.invitationId = "inv-1";
    sessionState.campaignAlias = "demo";
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
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
        template: { alias: "leadership-vision-alignment" },
        version: {
          id: "v1",
          language: "en",
          questions: [{ stableKey: "q1" }],
          sections: [{ stableKey: "s1" }],
        },
      },
    });
    const res = await GET(req() as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        campaign: { name: string; alias: string; templateAlias: string | null };
        version: { language: string };
        sections: unknown[];
        questions: unknown[];
      };
    };
    expect(body.data.campaign.alias).toBe("demo");
    expect(body.data.campaign.templateAlias).toBe("leadership-vision-alignment");
    expect(body.data.version.language).toBe("en");
    expect(body.data.questions).toEqual([{ stableKey: "q1" }]);
  });

  it("401 when cookie alias does not match URL alias", async () => {
    sessionState.invitationId = "inv-1";
    sessionState.campaignAlias = "OTHER";
    const res = await GET(req() as never, aliasParams("demo"));
    expect(res.status).toBe(401);
  });
});
