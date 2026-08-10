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

// eslint-disable-next-line no-var
var sessionState = { invitationId: "inv-1", campaignAlias: "demo" };

jest.mock("@/lib/assessments/invitation-cookie", () => ({
  getInvitationSession: jest.fn(() => Promise.resolve(sessionState)),
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentInvitation: { findUnique: jest.fn() },
    assessmentCampaignParticipant: {
      findUnique: jest.fn(() => Promise.resolve({ isCEO: false })),
    },
  },
}));

import { GET } from "@/app/(public)/org-survey/[campaignAlias]/me/route";
import { db } from "@/lib/db";
import {
  GENERIC_INVITED_WELCOME_CONFIG,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

const params = { params: Promise.resolve({ campaignAlias: "demo" }) };

function fixture(snapshot: unknown = GENERIC_INVITED_WELCOME_CONFIG, templateAlias = "qsp-v2") {
  return {
    id: "inv-1",
    status: "VIEWED",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    campaignId: "campaign-1",
    respondentId: "respondent-1",
    campaign: {
      id: "campaign-1",
      templateId: "template-1",
      name: "Demo campaign",
      alias: "demo",
      invitedWelcomeSnapshot: snapshot,
      deletedAt: null,
      status: "ACTIVE",
      openAt: new Date(Date.now() - 1_000),
      closeAt: null,
      customSlides: null,
      sendResultsToRespondent: false,
      organization: { name: "Acme" },
      template: { alias: templateAlias },
      version: {
        id: "version-1",
        language: "en",
        questions: [{ stableKey: "q1" }],
        sections: [{ stableKey: "s1" }],
      },
    },
  };
}

describe("GET /org-survey/[campaignAlias]/me invited Welcome", () => {
  const savedEnabled = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  const savedKill = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(fixture());
  });

  afterAll(() => {
    if (savedEnabled === undefined) delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
    else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = savedEnabled;
    if (savedKill === undefined) delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = savedKill;
  });

  it("omits invitedWelcome when the coordinated feature is off or killed", async () => {
    const off = await GET(new Request("http://localhost/org-survey/demo/me") as never, params);
    expect((await off.json()).data).not.toHaveProperty("invitedWelcome");

    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = "1";
    const killed = await GET(new Request("http://localhost/org-survey/demo/me") as never, params);
    expect((await killed.json()).data).not.toHaveProperty("invitedWelcome");
  });

  it("emits only the validated frozen campaign snapshot when active", async () => {
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    const authored = { ...GENERIC_INVITED_WELCOME_CONFIG, eyebrow: "Custom" };
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(fixture(authored));

    const response = await GET(new Request("http://localhost/org-survey/demo/me") as never, params);
    const body = await response.json();

    expect(body.data.invitedWelcome).toEqual(authored);
    expect(body.data.campaign).not.toHaveProperty("invitedWelcomeDefault");
  });

  it.each([null, { schemaVersion: 99 }, { schemaVersion: 1 }])(
    "uses the exact frozen legacy alias fallback for invalid snapshot %#",
    async (snapshot) => {
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
      (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
        fixture(snapshot, "qsp-v2"),
      );

      const response = await GET(new Request("http://localhost/org-survey/demo/me") as never, params);
      const body = await response.json();

      expect(body.data.invitedWelcome).toEqual(resolveLegacyInvitedWelcomeConfig("qsp-v2"));
    },
  );
});
