/**
 * Assessment v7.6 — POST
 * /api/assessment-campaigns/[id]/invitations/[invitationId]/resend.
 *
 * Defense-in-depth: a CLOSED or imported (externalId set) campaign must never
 * re-send an invitation email (ADR-0006).
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
      // SEC-M6: canManageCampaign now loads via findFirst. Delegate to
      // findUnique so existing mockResolvedValueOnce sequencing (authz row
      // first, then any route meta reads) is preserved unchanged.
      const findUnique = jest.fn();
      const findFirst = jest.fn((args) => findUnique(args));
      return { findUnique, findFirst };
    })(),
    assessmentInvitation: {
      findUnique: jest.fn(),
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

jest.mock("@/services/notifications", () => ({
  sendAssessmentInvitationEmail: jest.fn(),
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/invitations/[invitationId]/resend/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { sendAssessmentInvitationEmail } from "@/services/notifications";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

type CampaignOverrides = {
  status?: "DRAFT" | "ACTIVE" | "CLOSED";
  externalId?: string | null;
  invitationSubject?: string | null;
  invitationBodyMarkdown?: string | null;
};

function buildInvitation(overrides: CampaignOverrides = {}) {
  return {
    id: "inv-1",
    campaignId: "c1",
    status: "SENT" as const,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 86400_000),
    resentCount: 0,
    respondent: {
      id: "r1",
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@example.com",
      deletedAt: null as Date | null,
    },
    campaign: {
      id: "c1",
      name: "Demo",
      alias: "demo",
      closeAt: null as Date | null,
      status: overrides.status ?? ("ACTIVE" as const),
      externalId: overrides.externalId ?? null,
      invitationSubject:
        overrides.invitationSubject === undefined
          ? null
          : overrides.invitationSubject,
      invitationBodyMarkdown:
        overrides.invitationBodyMarkdown === undefined
          ? null
          : overrides.invitationBodyMarkdown,
      template: {
        name: "Five Dysfunctions",
        invitationSubject: "Take the assessment",
        invitationBodyMarkdown: "Hi {{respondentFirstName}}",
      },
      organization: {
        name: "Acme Corp",
        owner: { firstName: "Owner", lastName: "Coach" },
      },
      creatorCoach: { firstName: "Pat", lastName: "Coach" },
    },
  };
}

function detailParams(id: string, invitationId: string) {
  return { params: Promise.resolve({ id, invitationId }) };
}

function emptyReq(): Request {
  return new Request(
    "http://localhost/api/assessment-campaigns/c1/invitations/inv-1/resend",
    { method: "POST" }
  );
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
  // canManageCampaign reads the campaign (no include) to resolve org ownership.
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: "coach-1",
    status: "ACTIVE",
  });
  (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
    buildInvitation()
  );
  (db.assessmentInvitation.update as jest.Mock).mockResolvedValue({
    id: "inv-1",
    expiresAt: new Date(Date.now() + 86400_000),
    resentCount: 1,
  });
  (sendAssessmentInvitationEmail as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /api/assessment-campaigns/[id]/invitations/[invitationId]/resend", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(401);
  });

  it("happy path: resends an ACTIVE non-imported campaign invitation", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { invitationId: string; resentCount: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.invitationId).toBe("inv-1");
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
    expect(db.assessmentInvitation.update).toHaveBeenCalledTimes(1);
  });

  it("409 when campaign is CLOSED — no email sent (defense-in-depth)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
      buildInvitation({ status: "CLOSED" })
    );
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Cannot send invitations for a closed or imported campaign"
    );
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("409 when campaign was imported (externalId set) — no email sent", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
      buildInvitation({ status: "ACTIVE", externalId: "esperto:ABC123" })
    );
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Cannot send invitations for a closed or imported campaign"
    );
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("uses the per-campaign invitationSubject/Body override when present", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findUnique as jest.Mock).mockResolvedValue(
      buildInvitation({
        invitationSubject: "CUSTOM SUBJ",
        invitationBodyMarkdown: "CUSTOM BODY {{respondentFirstName}}",
      })
    );
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          invitationSubject: "CUSTOM SUBJ",
          invitationBodyMarkdown: "CUSTOM BODY {{respondentFirstName}}",
        }),
        organizationName: "Acme Corp",
        coachName: "Pat Coach",
        templateName: "Five Dysfunctions",
      })
    );
  });

  it("falls back to template defaults when no per-campaign override", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          invitationSubject: "Take the assessment",
          invitationBodyMarkdown: "Hi {{respondentFirstName}}",
        }),
      })
    );
  });

  it("does NOT rotate the token when the send fails", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce(
      new Error("smtp")
    );
    const res = await POST(emptyReq() as never, detailParams("c1", "inv-1"));
    expect(res.status).toBe(502);
    // Token-rotating update must NOT run when the send fails — prior link stays valid.
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });
});
