/**
 * Assessment v7.6 — GET/PATCH /api/assessment-campaigns/[id].
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

jest.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentCampaign: (() => {
      // SEC-M6: canManageCampaign now loads via findFirst → delegate to
      // findUnique so existing sequencing is preserved.
      const findUnique = jest.fn();
      const findFirst = jest.fn((args) => findUnique(args));
      return { findUnique, findFirst, update: jest.fn() };
    })(),
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

import { GET, PATCH } from "@/app/api/assessment-campaigns/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};
const otherCoachActor = {
  userId: "u2",
  email: "other@example.com",
  role: "COACH" as const,
  coachId: "coach-2",
};

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    {
      accessGroupId: "g1",
      coachId: "coach-1",
      accessGroup: { id: "g1", deletedAt: null },
    },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
});

describe("GET /api/assessment-campaigns/[id]", () => {
  it("401 unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("404 wrong-coach actor (createdByCoachId mismatch)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: creator coach reads campaign", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await GET(
      new Request("http://localhost/api/assessment-campaigns/c1") as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/assessment-campaigns/[id]", () => {
  function patchReq(body: unknown): Request {
    return new Request("http://localhost/api/assessment-campaigns/c1", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("404 when wrong coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 only when CLOSED (CLOSED is read-only)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "CLOSED",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
  });

  it("200 on an ACTIVE campaign (editable since commit 223721f — lock only CLOSED)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "ACTIVE",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      name: "Renamed",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
  });

  it("happy path updates name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
      id: "c1",
      name: "Renamed",
    });
    const res = await PATCH(
      patchReq({ name: "Renamed" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });

  // ── Task 12 (#20) — full-HTML invitation body on PATCH ──────────────────
  const ORIGINAL_HTML_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  const VALID_HTML = '<h1>Hi {{respondentFirstName}}</h1><a href="{{invitationUrl}}">Go</a>';

  function draftActorSetup() {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      templateId: "tpl-1",
      createdByCoachId: "coach-1",
      status: "DRAFT",
    });
    (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });
  }

  afterAll(() => {
    if (ORIGINAL_HTML_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_HTML_FLAG;
  });

  it("flag ON + valid invitationBodyHtml → stored RAW", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(patchReq({ invitationBodyHtml: VALID_HTML }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: VALID_HTML }),
      }),
    );
  });

  it("flag ON + invitationBodyHtml missing the URL token → 400, no update", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(
      patchReq({ invitationBodyHtml: "<p>No token here</p>" }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/survey link token/i);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("flag ON + empty string clears the override (stored null)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    draftActorSetup();
    const res = await PATCH(patchReq({ invitationBodyHtml: "" }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(db.assessmentCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: null }),
      }),
    );
  });

  it("flag OFF → invitationBodyHtml ignored (not in the update payload)", async () => {
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    draftActorSetup();
    const res = await PATCH(
      patchReq({ name: "Renamed", invitationBodyHtml: VALID_HTML }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const callArg = (db.assessmentCampaign.update as jest.Mock).mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("invitationBodyHtml");
  });
});
