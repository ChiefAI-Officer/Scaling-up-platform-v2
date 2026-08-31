jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/assessments/access-control", () => ({
  asAccessDb: (value: unknown) => value,
  canAccessOrganization: jest.fn().mockResolvedValue(true),
  canCreateCampaign: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/assessments/campaign-create-service", () => ({
  CampaignCreateError: class CampaignCreateError extends Error {},
  resolvePublishedTemplateVersion: jest.fn().mockResolvedValue({
    id: "version-1",
    language: "enUS",
    versionNumber: 1,
    publishedAt: new Date(),
  }),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn().mockResolvedValue({
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
  }),
  isPrivilegedRole: () => false,
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDAutoSendEnabled: () => false,
  waveDCustomHtmlEmailEnabled: () => false,
  assessmentInviteBrandedCustomHtmlEnabled: () => false,
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/db", () => {
  const assessmentTemplate = { findUnique: jest.fn() };
  const assessmentCampaign = { findMany: jest.fn(), create: jest.fn() };
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  return {
    db: {
      assessmentTemplate,
      assessmentCampaign,
      assessmentTemplateVersion: { findFirst: jest.fn(), findUnique: jest.fn() },
      organization: { findUnique: jest.fn() },
      orgRespondent: { findMany: jest.fn().mockResolvedValue([]) },
      orgTeam: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog,
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          assessmentTemplate,
          assessmentCampaign,
          assessmentCampaignParticipant: { createMany: jest.fn() },
          auditLog,
        }),
      ),
    },
  };
});

import { POST } from "@/app/api/assessment-campaigns/route";
import { db } from "@/lib/db";
import { canAccessOrganization } from "@/lib/assessments/access-control";
import { GENERIC_INVITED_WELCOME_CONFIG } from "@/lib/assessments/invited-welcome-config";

const baseBody = {
  name: "Q3",
  templateId: "template-1",
  organizationId: "org-1",
  openAt: "2026-06-01T10:00:00Z",
  endMode: "OPEN_END",
};

function request(body: unknown) {
  return new Request("http://localhost/api/assessment-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("invited Welcome snapshot on coach campaign create", () => {
  const savedEnabled = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  const savedKill = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
  let currentWelcome = GENERIC_INVITED_WELCOME_CONFIG;
  let currentReportStyle = "MODERN_DASHBOARD";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    currentWelcome = GENERIC_INVITED_WELCOME_CONFIG;
    currentReportStyle = "MODERN_DASHBOARD";
    (db.organization.findUnique as jest.Mock).mockResolvedValue({
      id: "org-1",
      name: "Acme",
    });
    (db.assessmentTemplate.findUnique as jest.Mock).mockImplementation(async () => ({
      id: "template-1",
      alias: "qsp-v2",
      disabledAt: null,
      defaultReportStyle: currentReportStyle,
      invitedWelcomeDefault: currentWelcome,
    }));
    (db.assessmentCampaign.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: `campaign-${(db.assessmentCampaign.create as jest.Mock).mock.calls.length}`,
        ...data,
      }),
    );
  });

  afterAll(() => {
    if (savedEnabled === undefined) delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
    else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = savedEnabled;
    if (savedKill === undefined) delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = savedKill;
  });

  it.each([
    ["legacy", {}],
    ["Wave-D", { waveD: true }],
  ])("resolves and inserts the snapshot inside the %s creation transaction", async (_lane, extra) => {
    const response = await POST(request({ ...baseBody, ...extra }) as never);

    expect(response.status).toBe(201);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeSnapshot: GENERIC_INVITED_WELCOME_CONFIG,
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "TEMPLATE_DEFAULT",
        }),
      }),
    );
  });

  it("changes only the second campaign when the template default changes", async () => {
    await POST(request(baseBody) as never);
    currentWelcome = { ...GENERIC_INVITED_WELCOME_CONFIG, eyebrow: "Changed" };
    await POST(request({ ...baseBody, name: "Q4" }) as never);

    const first = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0].data;
    const second = (db.assessmentCampaign.create as jest.Mock).mock.calls[1][0].data;
    expect(first.invitedWelcomeSnapshot.eyebrow).toBe("You're invited");
    expect(second.invitedWelcomeSnapshot.eyebrow).toBe("Changed");
  });

  it("normalizes a V1 template default into V2 for only the new campaign", async () => {
    currentWelcome = {
      schemaVersion: 1,
      eyebrow: "Frozen V1",
      headingTemplate: "{{campaignName}}",
      ledeParagraphs: ["Legacy copy."],
      sharingHeading: "Who reviews this",
      scoresHeading: "Your scores",
      scoresDescription: "Review the categories.",
      ctaLabel: "Begin",
      finePrint: null,
    } as never;

    await POST(request(baseBody) as never);
    currentWelcome = {
      ...GENERIC_INVITED_WELCOME_CONFIG,
      sharingDescription: "A newly authored explanation.",
    };
    await POST(request({ ...baseBody, name: "Q4" }) as never);

    const first = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0].data;
    const second = (db.assessmentCampaign.create as jest.Mock).mock.calls[1][0].data;
    expect(first.invitedWelcomeSnapshot).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        eyebrow: "Frozen V1",
        sharingDescription:
          "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.",
      }),
    );
    expect(second.invitedWelcomeSnapshot).toEqual(
      expect.objectContaining({
        schemaVersion: 2,
        sharingDescription: "A newly authored explanation.",
      }),
    );
    expect(first.invitedWelcomeSnapshot.sharingDescription).not.toBe(
      second.invitedWelcomeSnapshot.sharingDescription,
    );
  });

  it("writes the snapshot while off without exposing it in the create response", async () => {
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;

    const response = await POST(request(baseBody) as never);
    const body = await response.json();

    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeSnapshot: GENERIC_INVITED_WELCOME_CONFIG,
        }),
      }),
    );
    expect(body.data).not.toHaveProperty("invitedWelcomeSnapshot");
  });

  it("creates no campaign when the in-transaction resolver loses the template", async () => {
    (db.assessmentTemplate.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "template-1",
        alias: "qsp-v2",
        disabledAt: null,
        defaultReportStyle: "CLASSIC",
      })
      .mockResolvedValueOnce(null);

    const response = await POST(request(baseBody) as never);

    expect(response.status).toBe(500);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("rejects a forged reportStyle before authorization or database reads", async () => {
    const response = await POST(
      request({ ...baseBody, reportStyle: "CLASSIC" }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "REPORT_STYLE_ADMIN_OWNED",
    });
    expect(canAccessOrganization).not.toHaveBeenCalled();
    expect(db.assessmentTemplate.findUnique).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
