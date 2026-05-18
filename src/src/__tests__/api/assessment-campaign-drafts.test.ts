/**
 * Assessment v7.6 — GET/PUT/DELETE /api/assessment-campaign-drafts (Task K).
 *
 * Mirrors the workshop-drafts contract but keyed on coachId (unique).
 */

jest.mock("next/server", () => {
  class MockNextRequest extends Request {}
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          status: init?.status || 200,
          headers: init?.headers,
        }),
    },
  };
});

jest.mock("@/lib/db", () => ({
  db: {
    campaignWizardDraft: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
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

import { GET, PUT, DELETE } from "@/app/api/assessment-campaign-drafts/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const adminActor = {
  userId: "admin-u",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

function putReq(body: unknown): Request {
  return new Request("http://localhost/api/assessment-campaign-drafts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request("http://localhost/api/assessment-campaign-drafts", {
    method: "DELETE",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/assessment-campaign-drafts", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId (admin without coach profile)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns null when no draft exists for the coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: null });
    expect(db.campaignWizardDraft.findUnique).toHaveBeenCalledWith({
      where: { coachId: "coach-1" },
    });
  });

  it("returns the draft when one exists", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const draft = {
      id: "d1",
      coachId: "coach-1",
      currentStep: 2,
      stepsData: JSON.stringify({ organizationId: "org-1" }),
      lastSavedAt: new Date("2026-05-18T12:00:00Z"),
      createdAt: new Date("2026-05-18T11:00:00Z"),
      updatedAt: new Date("2026-05-18T12:00:00Z"),
    };
    (db.campaignWizardDraft.findUnique as jest.Mock).mockResolvedValue(draft);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("d1");
    expect(body.data.currentStep).toBe(2);
  });
});

describe("PUT /api/assessment-campaign-drafts", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await PUT(putReq({ step: 1, data: {} }) as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await PUT(putReq({ step: 1, data: {} }) as never);
    expect(res.status).toBe(403);
  });

  it("400 on invalid body shape", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // Missing required `step`
    const res = await PUT(putReq({ data: {} }) as never);
    expect(res.status).toBe(400);
  });

  it("400 on invalid JSON", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const badReq = new Request(
      "http://localhost/api/assessment-campaign-drafts",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      },
    );
    const res = await PUT(badReq as never);
    expect(res.status).toBe(400);
  });

  it("upserts the draft (create branch for first-time user)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.upsert as jest.Mock).mockResolvedValue({
      id: "d-new",
      coachId: "coach-1",
      currentStep: 1,
      stepsData: "{}",
      lastSavedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      putReq({ step: 1, data: { organizationId: "org-1" } }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, draftId: "d-new" });

    const upsertCall = (db.campaignWizardDraft.upsert as jest.Mock).mock
      .calls[0][0];
    expect(upsertCall.where).toEqual({ coachId: "coach-1" });
    expect(upsertCall.create.coachId).toBe("coach-1");
    expect(upsertCall.create.currentStep).toBe(1);
    expect(upsertCall.create.stepsData).toBe(
      JSON.stringify({ organizationId: "org-1" }),
    );
    expect(upsertCall.update.currentStep).toBe(1);
    expect(upsertCall.update.stepsData).toBe(
      JSON.stringify({ organizationId: "org-1" }),
    );
  });

  it("upserts the draft (update branch for returning user — same coachId, same row)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.upsert as jest.Mock).mockResolvedValue({
      id: "d-existing",
      coachId: "coach-1",
      currentStep: 3,
      stepsData: JSON.stringify({ templateId: "tpl-1" }),
      lastSavedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(
      putReq({ step: 3, data: { templateId: "tpl-1" } }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.draftId).toBe("d-existing");
    // upsert is called exactly once — same coachId resolves to same row
    expect(db.campaignWizardDraft.upsert).toHaveBeenCalledTimes(1);
  });

  it("stringifies null/undefined data as empty object", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.upsert as jest.Mock).mockResolvedValue({
      id: "d-null",
      coachId: "coach-1",
      currentStep: 0,
      stepsData: "{}",
      lastSavedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await PUT(putReq({ step: 0, data: null }) as never);
    expect(res.status).toBe(200);
    const upsertCall = (db.campaignWizardDraft.upsert as jest.Mock).mock
      .calls[0][0];
    expect(upsertCall.create.stepsData).toBe("{}");
    expect(upsertCall.update.stepsData).toBe("{}");
  });
});

describe("DELETE /api/assessment-campaign-drafts", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(deleteReq() as never);
    expect(res.status).toBe(401);
  });

  it("403 when actor has no coachId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await DELETE(deleteReq() as never);
    expect(res.status).toBe(403);
  });

  it("removes the draft for the calling coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    const res = await DELETE(deleteReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(db.campaignWizardDraft.deleteMany).toHaveBeenCalledWith({
      where: { coachId: "coach-1" },
    });
  });

  it("is a no-op when there is no draft (count 0 still 200)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.campaignWizardDraft.deleteMany as jest.Mock).mockResolvedValue({
      count: 0,
    });

    const res = await DELETE(deleteReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });
});
