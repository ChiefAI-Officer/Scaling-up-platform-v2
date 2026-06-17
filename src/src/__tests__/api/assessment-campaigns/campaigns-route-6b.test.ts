/**
 * Wave D — Task 6b: POST /api/assessment-campaigns persists sendResultsToRespondent + notifyCoachOnCompletion.
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
    coach: { findUnique: jest.fn() },
    accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
    accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentTemplate: { findUnique: jest.fn() },
    assessmentTemplateVersion: { findFirst: jest.fn() },
    assessmentCampaign: {
      findMany: jest.fn(),
      create: jest.fn(),
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

import { POST } from "@/app/api/assessment-campaigns/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/assessment-campaigns", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  name: "Q3",
  templateId: "tpl-1",
  organizationId: "org-1",
  openAt: "2026-06-01T10:00:00Z",
  endMode: "OPEN_END",
};

beforeEach(() => {
  jest.clearAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
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
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    certificationStatus: "ACTIVE",
  });
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
    name: "Acme",
  });
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({
    id: "tpl-1",
    alias: "rockefeller",
  });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    versionNumber: 1,
    publishedAt: new Date(),
  });
  (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
    id: "c1",
    alias: "acme_rockefeller_260601100000",
    status: "DRAFT",
    templateId: "tpl-1",
    versionId: "ver-1",
    organizationId: "org-1",
  });
});

describe("POST /api/assessment-campaigns — 6b toggle persistence", () => {
  it("persists sendResultsToRespondent=false and notifyCoachOnCompletion=false by default", async () => {
    const res = await POST(jsonReq(validBody) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendResultsToRespondent: false,
          notifyCoachOnCompletion: false,
        }),
      }),
    );
  });

  it("persists sendResultsToRespondent=true when provided in body", async () => {
    const res = await POST(
      jsonReq({ ...validBody, sendResultsToRespondent: true }) as never,
    );
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendResultsToRespondent: true,
        }),
      }),
    );
  });

  it("persists notifyCoachOnCompletion=true when provided in body", async () => {
    const res = await POST(
      jsonReq({ ...validBody, notifyCoachOnCompletion: true }) as never,
    );
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notifyCoachOnCompletion: true,
        }),
      }),
    );
  });

  it("persists both true when both provided", async () => {
    const res = await POST(
      jsonReq({
        ...validBody,
        sendResultsToRespondent: true,
        notifyCoachOnCompletion: true,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendResultsToRespondent: true,
          notifyCoachOnCompletion: true,
        }),
      }),
    );
  });
});
