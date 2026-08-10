jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

import { GET, PATCH } from "@/app/api/admin/assessment-templates/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  RESUME_NOTE,
  resolveLegacyInvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

const params = { params: Promise.resolve({ id: "tpl-1" }) };
const authored = {
  eyebrow: "Welcome aboard",
  headingTemplate: "Begin {{campaignName}}",
  ledeParagraphs: ["First paragraph.", "Second paragraph."],
  sharingHeading: "Who sees this",
  scoresHeading: "What you receive",
  scoresDescription: "Review the result by category.",
  ctaLabel: "Begin now",
};

function request(body: unknown) {
  return new Request("http://localhost/api/admin/assessment-templates/tpl-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    alias: "qsp-v2",
    resultsEmailSubject: null,
    resultsEmailBodyMarkdown: null,
    sendResultsDefault: false,
    disabledAt: null,
    invitedWelcomeDefault: {
      ...resolveLegacyInvitedWelcomeConfig("qsp-v2"),
      finePrint: RESUME_NOTE,
    },
    ...overrides,
  };
}

describe("PATCH invited Welcome template default", () => {
  const savedEnabled = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
  const savedKill = process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existing());
    (db.assessmentTemplate.update as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => existing(data),
    );
  });

  afterAll(() => {
    if (savedEnabled === undefined) {
      delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
    } else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = savedEnabled;
    if (savedKill === undefined) {
      delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    } else process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = savedKill;
  });

  it.each(["ADMIN", "STAFF"])("allows %s to save authored fields and preserves fine print", async (role) => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: `${role.toLowerCase()}-1`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      coachId: null,
    });

    const response = await PATCH(request({ invitedWelcomeDefault: authored }) as never, params);

    expect(response.status).toBe(200);
    expect(db.assessmentTemplate.update).toHaveBeenCalledWith({
      where: { id: "tpl-1" },
      data: {
        invitedWelcomeDefault: {
          schemaVersion: 1,
          ...authored,
          finePrint: RESUME_NOTE,
        },
      },
    });
  });

  it("uses the exact legacy fine print when stored JSON is invalid", async () => {
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
      existing({ invitedWelcomeDefault: { schemaVersion: 99 } }),
    );

    await PATCH(request({ invitedWelcomeDefault: authored }) as never, params);

    expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeDefault: expect.objectContaining({ finePrint: RESUME_NOTE }),
        }),
      }),
    );
  });

  it("rejects unauthenticated and coach writes before database access", async () => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(null);
    const unauthenticated = await PATCH(
      request({ invitedWelcomeDefault: authored }) as never,
      params,
    );
    expect(unauthenticated.status).toBe(401);

    (getApiActor as jest.Mock).mockResolvedValueOnce({
      userId: "coach-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    const coach = await PATCH(request({ invitedWelcomeDefault: authored }) as never, params);
    expect(coach.status).toBe(403);
    expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("rejects writes while the coordinated feature is off", async () => {
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;

    const response = await PATCH(request({ invitedWelcomeDefault: authored }) as never, params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "ADMIN_OWNED_PRESENTATION_DISABLED",
    });
    expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
  });

  it.each(["schemaVersion", "finePrint"])("rejects forged server field %s", async (field) => {
    const response = await PATCH(
      request({ invitedWelcomeDefault: { ...authored, [field]: field === "schemaVersion" ? 1 : "Mine" } }) as never,
      params,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "INVITED_WELCOME_SERVER_FIELDS_FORBIDDEN",
    });
    expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("round-trips paragraphs, strips unknown nested keys, and enforces field limits", async () => {
    const success = await PATCH(
      request({ invitedWelcomeDefault: { ...authored, unknown: "ignored" } }) as never,
      params,
    );
    expect(success.status).toBe(200);
    expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeDefault: expect.objectContaining({
            ledeParagraphs: ["First paragraph.", "Second paragraph."],
          }),
        }),
      }),
    );
    expect(
      (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0].data.invitedWelcomeDefault,
    ).not.toHaveProperty("unknown");

    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    const invalid = await PATCH(
      request({ invitedWelcomeDefault: { ...authored, ctaLabel: "x".repeat(81) } }) as never,
      params,
    );
    expect(invalid.status).toBe(400);
    expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
  });
});

describe("GET invited Welcome template default", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED;
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existing());
  });

  it("omits the persistence field while off and selects it only while active", async () => {
    const off = await GET(new Request("http://localhost") as never, params);
    expect((await off.json()).data).not.toHaveProperty("invitedWelcomeDefault");
    expect(db.assessmentTemplate.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ invitedWelcomeDefault: true }),
      }),
    );

    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    const active = await GET(new Request("http://localhost") as never, params);
    expect((await active.json()).data).toHaveProperty("invitedWelcomeDefault");
    expect(db.assessmentTemplate.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ invitedWelcomeDefault: true }),
      }),
    );
  });
});
