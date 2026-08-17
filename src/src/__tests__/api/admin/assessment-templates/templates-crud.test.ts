/**
 * Assessment v7.6 — Admin assessment template CRUD route tests (MVP).
 *
 * Covers:
 *   - POST /api/admin/assessment-templates: auth, body validation, alias collision,
 *     transaction creates template + first draft version, audit
 *   - PATCH /api/admin/assessment-templates/[id]: auth, 404, metadata update, audit
 *   - DELETE /api/admin/assessment-templates/[id]: auth, 404, 409 active-campaigns,
 *     soft-delete + audit
 *   - POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish:
 *     auth, 404, 409 already-published, publishedAt + publishedBy set, audit
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

const txMock = {
  assessmentTemplate: { create: jest.fn() },
  assessmentTemplateVersion: { create: jest.fn() },
};

jest.mock("@/lib/db", () => ({
  db: {
    assessmentTemplate: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    assessmentTemplateVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    assessmentCampaign: {
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
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

import { createHash } from "crypto";
import { POST as listPOST } from "@/app/api/admin/assessment-templates/route";
import {
  PATCH as detailPATCH,
  DELETE as detailDELETE,
} from "@/app/api/admin/assessment-templates/[id]/route";
import { POST as publishPOST } from "@/app/api/admin/assessment-templates/[id]/versions/[versionId]/publish/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { withRateLimit } from "@/lib/rate-limit";
import { GENERIC_INVITED_WELCOME_CONFIG } from "@/lib/assessments/invited-welcome-config";
import { createMarketingCtaPreset } from "@/lib/assessments/marketing-cta";

const adminActor = {
  userId: "u1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const coachActor = {
  userId: "u2",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function emptyReq(url: string, method = "DELETE"): Request {
  return new Request(url, { method });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/admin/assessment-templates (create)", () => {
  const simplifiedCreationEnvironment = [
    "WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED",
    "WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL",
    "WAVE_ED6_SINGLE_COLUMN_ENABLED",
    "WAVE_ED9_FORMS_BUILD_ENABLED",
    "WAVE_ED9_FORMS_BUILD_KILL",
    "WAVE_T_QUESTION_EDITOR_ENABLED",
    "WAVE_T_QUESTION_EDITOR_KILL",
    "WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED",
    "WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL",
    "WAVE_PUBLIC_MARKETING_CTA_ENABLED",
    "WAVE_PUBLIC_MARKETING_CTA_KILL",
  ] as const;
  const savedSimplifiedCreationEnvironment = new Map(
    simplifiedCreationEnvironment.map((key) => [key, process.env[key]]),
  );

  const validBody = {
    name: "Test Template",
    alias: "test-template",
    invitationSubject: "Hi",
    invitationBodyMarkdown: "Body",
    questions: [{ id: "q1" }],
    sections: [{ id: "s1" }],
    scoringConfig: { tiers: [] },
  };

  const authoredWelcome = {
    eyebrow: "Please begin",
    headingTemplate: "Complete {{campaignName}}",
    ledeParagraphs: ["Paragraph one.", "Paragraph two."],
    sharingHeading: "Who reviews this",
    scoresHeading: "Your scores",
    scoresDescription: "Review your categories.",
    ctaLabel: "Begin",
  };

  function enableSimplifiedCreation(): void {
    process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_ENABLED = "1";
    process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED = "1";
    process.env.WAVE_ED9_FORMS_BUILD_ENABLED = "1";
    process.env.WAVE_T_QUESTION_EDITOR_ENABLED = "1";
  }

  function enableWelcomeAuthoring(): void {
    process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_ENABLED = "1";
    delete process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL;
  }

  function enablePublicMarketingCta(): void {
    process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = "1";
    delete process.env.WAVE_PUBLIC_MARKETING_CTA_KILL;
  }

  beforeEach(() => {
    for (const key of simplifiedCreationEnvironment) delete process.env[key];
    (db.$transaction as jest.Mock)
      .mockReset()
      .mockImplementation((fn) => fn(txMock));
    (txMock.assessmentTemplate.create as jest.Mock).mockReset().mockResolvedValue({
      id: "tpl-1",
      alias: "test-template",
    });
    (txMock.assessmentTemplateVersion.create as jest.Mock)
      .mockReset()
      .mockResolvedValue({ id: "ver-1" });
  });

  afterEach(() => {
    for (const key of simplifiedCreationEnvironment) {
      const value = savedSimplifiedCreationEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(401);
  });

  it("403 when actor is not admin/staff", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(403);
  });

  it("400 when body fails validation (missing required field)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        name: "x",
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("409 on alias collision (Prisma P2002)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.$transaction as jest.Mock).mockRejectedValueOnce({
      code: "P2002",
    });
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(409);
  });

  it("keeps the exact legacy request and response while every flag is on", async () => {
    enableSimplifiedCreation();
    enableWelcomeAuthoring();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "test-template",
    });
    (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
      id: "ver-1",
    });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );

    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { id: "tpl-1", alias: "test-template" },
    });
  });

  it("server-owns the exact empty v1 defaults in simplified mode", async () => {
    enableSimplifiedCreation();
    enableWelcomeAuthoring();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockImplementation(
      ({ data }: { data: { alias: string } }) => ({
        id: "tpl-1",
        alias: data.alias,
      }),
    );
    (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
      id: "ver-1",
    });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: {
        id: "tpl-1",
        alias: "test-template",
        versionId: "ver-1",
      },
    });
    expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          language: "enUS",
          questions: [],
          sections: [],
          scoringConfig: {
            tierMetric: "countAchieved",
            passThreshold: 0,
            tiers: [],
          },
          publishedAt: null,
        }),
      }),
    );
    expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Test Template",
          alias: "test-template",
          description: null,
          invitationSubject: "You're invited to take an assessment",
          aggregationMode: "FULL_VISIBILITY",
          invitedWelcomeDefault: GENERIC_INVITED_WELCOME_CONFIG,
        }),
      }),
    );
    expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ invitedWelcomeDefault: expect.anything() }),
      }),
    );
  });

  it("requires an explicit delivery type in simplified mode when the wave is enabled", async () => {
    enableSimplifiedCreation();
    enablePublicMarketingCta();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "DELIVERY_TYPE_REQUIRED",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("persists the selected public delivery type", async () => {
    enableSimplifiedCreation();
    enablePublicMarketingCta();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        deliveryType: "PUBLIC_MARKETING_QUIZ",
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryType: "PUBLIC_MARKETING_QUIZ",
        }),
      }),
    );
  });

  it("persists an enabled authored Welcome default with the existing create transaction", async () => {
    enableSimplifiedCreation();
    enableWelcomeAuthoring();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockImplementation(
      ({ data }: { data: { alias: string } }) => ({ id: "tpl-1", alias: data.alias }),
    );

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        invitedWelcomeDefault: authoredWelcome,
      }) as never,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: "tpl-1", alias: "test-template", versionId: "ver-1" },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeDefault: {
            schemaVersion: 1,
            ...authoredWelcome,
            finePrint: null,
          },
        }),
      }),
    );
    expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ invitedWelcomeDefault: expect.anything() }),
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...authoredWelcome, schemaVersion: 1 },
    { ...authoredWelcome, finePrint: "Mine" },
    { ...authoredWelcome, headingTemplate: "{{respondentName}}" },
    { ...authoredWelcome, ledeParagraphs: ["1", "2", "3", "4", "5"] },
    { ...authoredWelcome, ctaLabel: "x".repeat(81) },
    { ...authoredWelcome, eyebrow: "Bad\u0007copy" },
  ])("rejects invalid enabled Welcome authoring before a transaction", async (invitedWelcomeDefault) => {
    enableSimplifiedCreation();
    enableWelcomeAuthoring();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        invitedWelcomeDefault,
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["layout", { density: "compact" }],
    ["styles", { accentColor: "#000000" }],
    ["disclosure", "Client-supplied disclosure"],
    ["facts", [{ label: "Questions", value: "12" }]],
  ])(
    "rejects the unknown enabled Welcome key %s before a transaction",
    async (unknownKey, unknownValue) => {
      enableSimplifiedCreation();
      enableWelcomeAuthoring();
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);

      const response = await listPOST(
        jsonReq("http://localhost/api/admin/assessment-templates", {
          creationMode: "simplified",
          name: "Test Template",
          invitedWelcomeDefault: {
            ...authoredWelcome,
            [unknownKey]: unknownValue,
          },
        }) as never,
      );

      expect(response.status).toBe(400);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["off", () => undefined],
    ["killed", () => {
      enableWelcomeAuthoring();
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = "1";
    }],
  ] as const)("rejects authored Welcome input before a transaction while presentation is %s", async (_posture, configure) => {
    enableSimplifiedCreation();
    configure();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        invitedWelcomeDefault: authoredWelcome,
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["off", () => undefined],
    ["killed", () => {
      enableWelcomeAuthoring();
      process.env.WAVE_ADMIN_OWNED_ASSESSMENT_PRESENTATION_KILL = "1";
    }],
  ] as const)("keeps the generic Welcome fallback while presentation is %s", async (_posture, configure) => {
    enableSimplifiedCreation();
    configure();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(response.status).toBe(201);
    expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeDefault: GENERIC_INVITED_WELCOME_CONFIG,
        }),
      }),
    );
  });

  it("does not audit when the create transaction rolls back after Welcome validation", async () => {
    enableSimplifiedCreation();
    enableWelcomeAuthoring();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplateVersion.create as jest.Mock).mockRejectedValueOnce(
      new Error("version write failed"),
    );

    const response = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        invitedWelcomeDefault: authoredWelcome,
      }) as never,
    );

    expect(response.status).toBe(500);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("retries generated IDs through the third available alias exactly once per transaction", async () => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockImplementation(
      ({ data }: { data: { alias: string } }) => ({ id: "tpl-1", alias: data.alias }),
    );
    let transactionAttempt = 0;
    (db.$transaction as jest.Mock).mockImplementation(async (fn) => {
      transactionAttempt += 1;
      const result = await fn(txMock);
      if (transactionAttempt < 3) throw { code: "P2002" };
      return result;
    });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      success: true,
      data: { id: "tpl-1", alias: "test-template-3", versionId: "ver-1" },
    });
    expect(withRateLimit).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(3);
    expect(txMock.assessmentTemplate.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ alias: "test-template" }) }),
    );
    expect(txMock.assessmentTemplate.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ alias: "test-template-2" }) }),
    );
    expect(txMock.assessmentTemplate.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ data: expect.objectContaining({ alias: "test-template-3" }) }),
    );
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("returns 409 without changing a colliding manual ID", async () => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.$transaction as jest.Mock).mockRejectedValueOnce({ code: "P2002" });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
        internalId: "my-stable-id",
      }) as never,
    );

    expect(res.status).toBe(409);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentTemplate.create).not.toHaveBeenCalled();
  });

  it.each([
    ["the release flag is off", () => undefined],
    ["the release flag is killed", () => {
      enableSimplifiedCreation();
      process.env.WAVE_TEMPLATE_CREATION_SIMPLIFIED_KILL = "1";
    }],
    ["the ED6 prerequisite is off", () => {
      enableSimplifiedCreation();
      delete process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED;
    }],
    ["the ED9 prerequisite is killed", () => {
      enableSimplifiedCreation();
      process.env.WAVE_ED9_FORMS_BUILD_KILL = "1";
    }],
    ["the Wave T prerequisite is killed", () => {
      enableSimplifiedCreation();
      process.env.WAVE_T_QUESTION_EDITOR_KILL = "1";
    }],
  ])("rejects simplified mode before a transaction when %s", async (_reason, configure) => {
    configure();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Simplified creation is unavailable",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { creationMode: "simplified", name: "Test Template", unexpected: true },
    { creationMode: "simplified", name: "Test Template", internalId: "Not Valid" },
  ])("rejects malformed simplified requests before a transaction", async (body) => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", body) as never,
    );

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only simplified name even with a manual internal ID", async () => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "   ",
        internalId: "valid-id",
      }) as never,
    );

    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("stops generated collision retries at 25 attempts", async () => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.$transaction as jest.Mock).mockRejectedValue({ code: "P2002" });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "Internal ID is already in use",
    });
    expect(db.$transaction).toHaveBeenCalledTimes(25);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 500 without an audit for a non-unique transaction error", async () => {
    enableSimplifiedCreation();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.$transaction as jest.Mock).mockRejectedValue({ code: "P2003" });

    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", {
        creationMode: "simplified",
        name: "Test Template",
      }) as never,
    );

    expect(res.status).toBe(500);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("201 + creates template + first draft version + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (txMock.assessmentTemplate.create as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      alias: "test-template",
    });
    (txMock.assessmentTemplateVersion.create as jest.Mock).mockResolvedValue({
      id: "ver-1",
    });
    const res = await listPOST(
      jsonReq("http://localhost/api/admin/assessment-templates", validBody) as never,
    );
    expect(res.status).toBe(201);
    expect(txMock.assessmentTemplate.create).toHaveBeenCalled();
    expect(txMock.assessmentTemplateVersion.create).toHaveBeenCalled();
    const versionArgs = (txMock.assessmentTemplateVersion.create as jest.Mock).mock
      .calls[0][0];
    expect(versionArgs.data.publishedAt).toBeNull();
    expect(versionArgs.data.versionNumber).toBe(1);
    expect(versionArgs.data.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(versionArgs.data).not.toHaveProperty("invitedWelcomeDefault");
    expect(txMock.assessmentTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invitedWelcomeDefault: GENERIC_INVITED_WELCOME_CONFIG,
        }),
      }),
    );
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/assessment-templates/[id]", () => {
  function patchReq(body: unknown) {
    return jsonReq(
      "http://localhost/api/admin/assessment-templates/tpl-1",
      body,
      "PATCH",
    );
  }
  const detailParams = { params: Promise.resolve({ id: "tpl-1" }) };

  describe("delivery type lock", () => {
    const savedEnabled = process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED;
    const savedKill = process.env.WAVE_PUBLIC_MARKETING_CTA_KILL;

    function existingDeliveryTemplate(
      deliveryType: "PUBLIC_MARKETING_QUIZ" | "INVITED_ASSESSMENT" =
        "INVITED_ASSESSMENT",
    ) {
      return {
        id: "tpl-1",
        alias: "test-template",
        deliveryType,
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
        sendResultsDefault: false,
        disabledAt: null,
        invitedWelcomeDefault: null,
      };
    }

    beforeEach(() => {
      process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = "1";
      delete process.env.WAVE_PUBLIC_MARKETING_CTA_KILL;
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingDeliveryTemplate(),
      );
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue(
        existingDeliveryTemplate("PUBLIC_MARKETING_QUIZ"),
      );
      (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(
        null,
      );
    });

    afterEach(() => {
      if (savedEnabled === undefined) {
        delete process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED;
      } else {
        process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = savedEnabled;
      }
      if (savedKill === undefined) {
        delete process.env.WAVE_PUBLIC_MARKETING_CTA_KILL;
      } else {
        process.env.WAVE_PUBLIC_MARKETING_CTA_KILL = savedKill;
      }
    });

    it("allows a delivery type correction before first publication", async () => {
      const response = await detailPATCH(
        patchReq({ deliveryType: "PUBLIC_MARKETING_QUIZ" }) as never,
        detailParams,
      );

      expect(response.status).toBe(200);
      expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryType: "PUBLIC_MARKETING_QUIZ",
          }),
        }),
      );
    });

    it("rejects a delivery type change after first publication", async () => {
      (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
        id: "ver-published",
      });

      const response = await detailPATCH(
        patchReq({ deliveryType: "PUBLIC_MARKETING_QUIZ" }) as never,
        detailParams,
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "DELIVERY_TYPE_LOCKED",
      });
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it("rejects delivery type writes while the wave is off", async () => {
      delete process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED;

      const response = await detailPATCH(
        patchReq({ deliveryType: "PUBLIC_MARKETING_QUIZ" }) as never,
        detailParams,
      );

      expect(response.status).toBe(403);
      expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe("report-style default writes", () => {
    const savedEnabled = process.env.WAVE_REPORT_STYLES_ENABLED;
    const savedKill = process.env.WAVE_REPORT_STYLES_KILL;
    const savedCanary = process.env.WAVE_REPORT_STYLES_CANARY;

    function existingReportStyleTemplate(over: Record<string, unknown> = {}) {
      return {
        id: "tpl-1",
        alias: "scaling-up-full",
        resultsEmailSubject: null,
        resultsEmailBodyMarkdown: null,
        sendResultsDefault: false,
        disabledAt: null,
        defaultReportStyle: "CLASSIC",
        ...over,
      };
    }

    beforeEach(() => {
      delete process.env.WAVE_REPORT_STYLES_ENABLED;
      delete process.env.WAVE_REPORT_STYLES_KILL;
      delete process.env.WAVE_REPORT_STYLES_CANARY;
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingReportStyleTemplate(),
      );
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue(
        existingReportStyleTemplate({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }),
      );
    });

    afterEach(() => {
      if (savedEnabled === undefined) delete process.env.WAVE_REPORT_STYLES_ENABLED;
      else process.env.WAVE_REPORT_STYLES_ENABLED = savedEnabled;
      if (savedKill === undefined) delete process.env.WAVE_REPORT_STYLES_KILL;
      else process.env.WAVE_REPORT_STYLES_KILL = savedKill;
      if (savedCanary === undefined) delete process.env.WAVE_REPORT_STYLES_CANARY;
      else process.env.WAVE_REPORT_STYLES_CANARY = savedCanary;
    });

    it("rejects an unauthenticated report-style write before reading or writing", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);

      const res = await detailPATCH(
        patchReq({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }) as never,
        detailParams,
      );

      expect(res.status).toBe(401);
      expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it("rejects a non-privileged report-style write before reading or writing", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);

      const res = await detailPATCH(
        patchReq({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }) as never,
        detailParams,
      );

      expect(res.status).toBe(403);
      expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it("rejects report-style keys outside the closed catalog", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";

      const res = await detailPATCH(
        patchReq({ defaultReportStyle: "UNRECOGNIZED_STYLE" }) as never,
        detailParams,
      );

      expect(res.status).toBe(400);
      expect(db.assessmentTemplate.findFirst).not.toHaveBeenCalled();
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it.each(["CLASSIC", "EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"])(
      "rejects %s while report styles are unavailable without changing the stored choice",
      async (defaultReportStyle) => {
        const res = await detailPATCH(
          patchReq({ defaultReportStyle }) as never,
          detailParams,
        );

        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({ error: "REPORT_STYLE_UNAVAILABLE" });
        expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
        expect(db.auditLog.create).not.toHaveBeenCalled();
      },
    );

    it("allows every valid report style for a template with an arbitrary alias", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingReportStyleTemplate({ alias: "another-template" }),
      );

      const res = await detailPATCH(
        patchReq({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }) as never,
        detailParams,
      );

      expect(res.status).toBe(200);
      expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultReportStyle: "EXECUTIVE_BOARDROOM" }),
        }),
      );
    });

    it("allows Classic reset for any template when report styles are available", async () => {
      process.env.WAVE_REPORT_STYLES_ENABLED = "1";
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingReportStyleTemplate({ alias: "another-template" }),
      );
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue(
        existingReportStyleTemplate({
          alias: "another-template",
          defaultReportStyle: "CLASSIC",
        }),
      );

      const res = await detailPATCH(
        patchReq({ defaultReportStyle: "CLASSIC" }) as never,
        detailParams,
      );

      expect(res.status).toBe(200);
      expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tpl-1" },
          data: expect.objectContaining({ defaultReportStyle: "CLASSIC" }),
        }),
      );
      await expect(res.json()).resolves.toEqual({
        success: true,
        data: existingReportStyleTemplate({
          alias: "another-template",
          defaultReportStyle: "CLASSIC",
        }),
      });
    });

    it.each(["EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"] as const)(
      "allows a privileged template update to %s and audits only the enum key",
      async (defaultReportStyle) => {
        process.env.WAVE_REPORT_STYLES_ENABLED = "1";
        (db.assessmentTemplate.update as jest.Mock).mockResolvedValue(
          existingReportStyleTemplate({ defaultReportStyle }),
        );

        const res = await detailPATCH(
          patchReq({ defaultReportStyle }) as never,
          detailParams,
        );

        expect(res.status).toBe(200);
        expect(db.assessmentTemplate.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              defaultReportStyle,
            }),
          }),
        );
        const auditArgs = (db.auditLog.create as jest.Mock).mock.calls[0][0];
        expect(JSON.parse(auditArgs.data.changes)).toEqual({
          defaultReportStyle,
        });
        await expect(res.json()).resolves.toEqual({
          success: true,
          data: existingReportStyleTemplate({ defaultReportStyle }),
        });
      },
    );
  });

  it("404 when template missing or deleted", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await detailPATCH(patchReq({ name: "New name" }) as never, detailParams);
    expect(res.status).toBe(404);
  });

  it("happy path: updates metadata + writes audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
    const res = await detailPATCH(
      patchReq({ name: "Renamed", aggregationMode: "CEO_ONLY" }) as never,
      detailParams,
    );
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.name).toBe("Renamed");
    expect(updateArgs.data.aggregationMode).toBe("CEO_ONLY");
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  // SEC-H2 — results-email approval is bound to a content hash. The PATCH
  // handler must clear approval when content is edited without re-approving,
  // and must bind the stored hash to the post-update content when approving.
  describe("SEC-H2 results-email approval binding", () => {
    function existingTemplate(over: Record<string, unknown> = {}) {
      return {
        id: "tpl-1",
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here is your report.",
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: hashOf("Your results", "Here is your report."),
        resultsEmailContentApprovedAt: new Date("2026-06-01T00:00:00Z"),
        resultsEmailContentApprovedBy: "prev@example.com",
        ...over,
      };
    }

    function hashOf(subject: string | null, body: string | null): string {
      // Local mirror of the helper's canonicalization (kept independent so the
      // test pins the exact contract, not the implementation).
      return createHash("sha256")
        .update(JSON.stringify([subject ?? "", body ?? ""]))
        .digest("hex");
    }

    it("editing the body after approval clears approval + hash + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailBodyMarkdown: "Edited body" }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailBodyMarkdown).toBe("Edited body");
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBeNull();
    });

    it("editing the subject after approval clears approval", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailSubject: "New subject" }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
    });

    it("does NOT clear approval when content is sent unchanged (no-op edit)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here is your report.",
        }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      // Approval state untouched (not forced to false).
      expect(updateArgs.data.resultsEmailContentApproved).toBeUndefined();
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeUndefined();
    });

    it("approving stores hash (of current content) + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingTemplate({
          resultsEmailContentApproved: false,
          resultsEmailContentApprovedHash: null,
          resultsEmailContentApprovedAt: null,
          resultsEmailContentApprovedBy: null,
        }),
      );
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailContentApproved: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(true);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBe(
        hashOf("Your results", "Here is your report."),
      );
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBe(adminActor.email);
    });

    it("editing AND approving in one request binds the hash to the NEW content", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({
          resultsEmailSubject: "Fresh subject",
          resultsEmailBodyMarkdown: "Fresh body",
          resultsEmailContentApproved: true,
        }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(true);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBe(
        hashOf("Fresh subject", "Fresh body"),
      );
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBe(adminActor.email);
    });

    it("explicit unapprove (false) clears hash + at + by", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingTemplate());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
      const res = await detailPATCH(
        patchReq({ resultsEmailContentApproved: false }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.resultsEmailContentApproved).toBe(false);
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeNull();
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Wave Q (#1 + #6) — sendResultsDefault write + disable/enable, flag-gated.
  // The FLAG gates these WRITES only; enforcement (picker filter + campaign
  // create 409) is unconditional and tested in the respective route tests.
  // ─────────────────────────────────────────────────────────────────────────
  describe("Wave Q — sendResultsDefault + disabled (flag-gated writes)", () => {
    const savedEnabled = process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
    const savedKill = process.env.WAVE_Q_ADMIN_CONTROLS_KILL;

    function existingWaveQ(over: Record<string, unknown> = {}) {
      return {
        id: "tpl-1",
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here is your report.",
        sendResultsDefault: false,
        disabledAt: null,
        ...over,
      };
    }

    beforeEach(() => {
      delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
      delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(existingWaveQ());
      (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
    });

    afterEach(() => {
      if (savedEnabled === undefined) delete process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED;
      else process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = savedEnabled;
      if (savedKill === undefined) delete process.env.WAVE_Q_ADMIN_CONTROLS_KILL;
      else process.env.WAVE_Q_ADMIN_CONTROLS_KILL = savedKill;
    });

    function auditCallsByAction(action: string) {
      return (db.auditLog.create as jest.Mock).mock.calls.filter(
        (c) => c[0].data.action === action,
      );
    }

    it("flag OFF + sendResultsDefault present → 403 and NO write", async () => {
      const res = await detailPATCH(
        patchReq({ sendResultsDefault: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(403);
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("flag OFF + disabled present → 403 and NO write", async () => {
      const res = await detailPATCH(
        patchReq({ disabled: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(403);
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it("flag ON: writes sendResultsDefault + audits TEMPLATE_RESULTS_DEFAULT_CHANGED (old→new), approval fields untouched", async () => {
      process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
      const res = await detailPATCH(
        patchReq({ sendResultsDefault: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.sendResultsDefault).toBe(true);
      // Independent of the results-email approval hash: a default flip must
      // NOT invalidate or touch any approval field.
      expect(updateArgs.data.resultsEmailContentApproved).toBeUndefined();
      expect(updateArgs.data.resultsEmailContentApprovedHash).toBeUndefined();
      expect(updateArgs.data.resultsEmailContentApprovedAt).toBeUndefined();
      expect(updateArgs.data.resultsEmailContentApprovedBy).toBeUndefined();
      const audits = auditCallsByAction("TEMPLATE_RESULTS_DEFAULT_CHANGED");
      expect(audits).toHaveLength(1);
      const changes = JSON.parse(audits[0][0].data.changes);
      expect(changes.sendResultsDefault).toEqual({ old: false, new: true });
    });

    it("flag ON: disabled:true sets disabledAt + audits TEMPLATE_DISABLED, with NO active-campaign guard", async () => {
      process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
      // An ACTIVE campaign exists — the DELETE handler 409s on this, but
      // disable must NOT (existing campaigns keep running by design).
      (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({ id: "c1" });
      const res = await detailPATCH(
        patchReq({ disabled: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      // No campaign lookup at all on the disable path.
      expect(db.assessmentCampaign.findFirst).not.toHaveBeenCalled();
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.disabledAt).toBeInstanceOf(Date);
      expect(auditCallsByAction("TEMPLATE_DISABLED")).toHaveLength(1);
    });

    it("flag ON: disabled:true on an already-disabled template is a no-op (timestamp preserved, no audit)", async () => {
      process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingWaveQ({ disabledAt: new Date("2026-07-01T00:00:00Z") }),
      );
      const res = await detailPATCH(
        patchReq({ disabled: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.disabledAt).toBeUndefined();
      expect(auditCallsByAction("TEMPLATE_DISABLED")).toHaveLength(0);
    });

    it("flag ON: disabled:false clears disabledAt + audits TEMPLATE_ENABLED", async () => {
      process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
      (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(
        existingWaveQ({ disabledAt: new Date("2026-07-01T00:00:00Z") }),
      );
      const res = await detailPATCH(
        patchReq({ disabled: false }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.disabledAt).toBeNull();
      expect(auditCallsByAction("TEMPLATE_ENABLED")).toHaveLength(1);
    });

    it("flag ON via kill switch → still 403 (KILL beats ENABLED)", async () => {
      process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED = "1";
      process.env.WAVE_Q_ADMIN_CONTROLS_KILL = "1";
      const res = await detailPATCH(
        patchReq({ sendResultsDefault: true }) as never,
        detailParams,
      );
      expect(res.status).toBe(403);
      expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
    });

    it("flag OFF: a PATCH WITHOUT Wave-Q fields still works (regression)", async () => {
      const res = await detailPATCH(
        patchReq({ name: "Renamed" }) as never,
        detailParams,
      );
      expect(res.status).toBe(200);
      const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.name).toBe("Renamed");
    });
  });
});

describe("DELETE /api/admin/assessment-templates/[id]", () => {
  const detailParams = { params: Promise.resolve({ id: "tpl-1" }) };

  it("404 when template missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(404);
  });

  it("409 when an ACTIVE campaign references the template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({ id: "c1" });
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("TEMPLATE_HAS_ACTIVE_CAMPAIGNS");
  });

  it("409 when a live DRAFT campaign references the template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue({ id: "draft-1" });

    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );

    expect(res.status).toBe(409);
    expect(db.assessmentTemplate.update).not.toHaveBeenCalled();
  });

  it("ignores a soft-deleted ACTIVE campaign when deleting the template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockImplementation(
      ({ where }: { where: { deletedAt?: null } }) =>
        where.deletedAt === null ? null : { id: "deleted-active-campaign" },
    );
    (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});

    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );

    expect(res.status).toBe(200);
    expect(db.assessmentTemplate.update).toHaveBeenCalled();
  });

  it("happy path: soft-deletes + audits when no active campaigns", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplate.findFirst as jest.Mock).mockResolvedValue({ id: "tpl-1" });
    (db.assessmentCampaign.findFirst as jest.Mock).mockResolvedValue(null);
    (db.assessmentTemplate.update as jest.Mock).mockResolvedValue({});
    const res = await detailDELETE(
      emptyReq("http://localhost/api/admin/assessment-templates/tpl-1") as never,
      detailParams,
    );
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplate.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(db.auditLog.create).toHaveBeenCalled();
  });
});

describe("POST /api/admin/assessment-templates/[id]/versions/[versionId]/publish", () => {
  const publishParams = {
    params: Promise.resolve({ id: "tpl-1", versionId: "ver-1" }),
  };

  function pubReq() {
    return emptyReq(
      "http://localhost/api/admin/assessment-templates/tpl-1/versions/ver-1/publish",
      "POST",
    );
  }

  it("404 when version missing", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(404);
  });

  it("404 when version belongs to a different template", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-other",
      publishedAt: null,
      versionNumber: 1,
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(404);
  });

  it("409 when already published", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: new Date(),
      versionNumber: 1,
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("ALREADY_PUBLISHED");
  });

  it("happy path: sets publishedAt + publishedBy + audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    // D2.1 strict publish-time validation now runs against the full content;
    // mock must include passable questions/sections/scoringConfig (no D2
    // opt-ins so legacy schema rules apply).
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: null,
      versionNumber: 1,
      questions: [
        {
          stableKey: "Q1",
          sortOrder: 1,
          type: "SLIDER_LIKERT",
          label: "Q1",
          isRequired: true,
          sectionStableKey: "S1",
          scale: { min: 0, max: 3, step: 1, anchorMin: "L", anchorMax: "H" },
        },
      ],
      sections: [{ stableKey: "S1", sortOrder: 1, name: "S1" }],
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 2,
        tiers: [{ minMetric: 0, maxMetric: 3, label: "X", message: "x" }],
      },
    });
    (db.assessmentTemplateVersion.update as jest.Mock).mockResolvedValue({});
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(200);
    const updateArgs = (db.assessmentTemplateVersion.update as jest.Mock).mock
      .calls[0][0];
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.publishedBy).toBe("u1");
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("422 PUBLISH_VALIDATION_FAILED when content has placeholder sentinel (D2.1)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: null,
      versionNumber: 1,
      questions: [
        {
          stableKey: "Q1",
          sortOrder: 1,
          type: "SLIDER_LIKERT",
          label: "Q1",
          isRequired: true,
          sectionStableKey: "S1",
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
          recommendations: [
            { minScore: 0, maxScore: 3, text: "TODO low copy" },
            { minScore: 4, maxScore: 7, text: "mid copy" },
            { minScore: 8, maxScore: 10, text: "high copy" },
          ],
        },
      ],
      sections: [{ stableKey: "S1", sortOrder: 1, name: "S1" }],
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [{ minMetric: 0, maxMetric: 10, label: "X", message: "x" }],
      },
    });
    const res = await publishPOST(pubReq() as never, publishParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("PUBLISH_VALIDATION_FAILED");
  });

  it("requires an action-ready CTA before publishing a public quiz", async () => {
    process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED = "1";
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      id: "ver-1",
      templateId: "tpl-1",
      publishedAt: null,
      versionNumber: 1,
      questions: [],
      sections: [],
      scoringConfig: { tiers: [] },
      reportConfig: {
        publicMarketing: {
          marketingCta: createMarketingCtaPreset("BLANK"),
        },
      },
      template: { deliveryType: "PUBLIC_MARKETING_QUIZ" },
    });

    const res = await publishPOST(pubReq() as never, publishParams);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/button/i) }),
      ]),
    );
    delete process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED;
  });
});
