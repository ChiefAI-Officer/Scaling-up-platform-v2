/**
 * Wave D — Task 12 (#20): POST /api/assessment-campaigns accepts a per-campaign
 * full-HTML invitation body (`invitationBodyHtml`), validate-on-save:
 *   - flag ON  + valid HTML (token present)  → stored RAW (not sanitized at rest)
 *   - flag ON  + missing/misplaced token     → 400 with the validator `reason`
 *   - flag ON  + HTML over the length cap     → 400
 *   - flag OFF                               → field ignored (stored null)
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
    assessmentCampaign: { findMany: jest.fn(), create: jest.fn() },
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

const VALID_HTML = '<h1>Hi {{respondentFirstName}}</h1><a href="{{invitationUrl}}">Start</a>';
const NO_TOKEN_HTML = '<h1>Hi there</h1><p>No link here.</p>';
const MISPLACED_HTML = '<img src="{{invitationUrl}}" alt="x" />';

const ORIGINAL_FLAG = process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
  (db.coach.findUnique as jest.Mock).mockResolvedValue({ id: "coach-1", certificationStatus: "ACTIVE" });
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1", ownerCoachId: "coach-1", deletedAt: null, name: "Acme",
  });
  (db.assessmentTemplate.findUnique as jest.Mock).mockResolvedValue({ id: "tpl-1", alias: "rockefeller" });
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1", language: "enUS", versionNumber: 1, publishedAt: new Date(),
  });
  (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
    id: "c1", alias: "acme_rockefeller_260601100000", status: "DRAFT",
    templateId: "tpl-1", versionId: "ver-1", organizationId: "org-1",
  });
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
  else process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = ORIGINAL_FLAG;
});

describe("POST /api/assessment-campaigns — invitationBodyHtml validate-on-save (#20)", () => {
  it("flag ON + valid HTML → stored RAW (not sanitized at rest)", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    const res = await POST(jsonReq({ ...validBody, invitationBodyHtml: VALID_HTML }) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: VALID_HTML }),
      }),
    );
  });

  it("flag ON + HTML missing the URL token → 400 with the validator reason", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    const res = await POST(jsonReq({ ...validBody, invitationBodyHtml: NO_TOKEN_HTML }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(String(json.error)).toMatch(/survey link token/i);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("flag ON + URL token in a disallowed position (img src) → 400", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    const res = await POST(jsonReq({ ...validBody, invitationBodyHtml: MISPLACED_HTML }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/link href|plain text|attribute/i);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("flag ON + HTML over the length cap → 400", async () => {
    process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED = "1";
    const huge = '<a href="{{invitationUrl}}">x</a>' + "y".repeat(60_000);
    const res = await POST(jsonReq({ ...validBody, invitationBodyHtml: huge }) as never);
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("flag OFF → invitationBodyHtml ignored, stored null", async () => {
    delete process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED;
    const res = await POST(jsonReq({ ...validBody, invitationBodyHtml: VALID_HTML }) as never);
    expect(res.status).toBe(201);
    expect(db.assessmentCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invitationBodyHtml: null }),
      }),
    );
  });
});
