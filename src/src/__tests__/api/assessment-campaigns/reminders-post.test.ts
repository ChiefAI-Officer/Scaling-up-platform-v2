/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/reminders (Task N).
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
      findMany: jest.fn(),
      update: jest.fn(),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
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
  withRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/services/notifications", () => ({
  sendAssessmentInvitationEmail: jest.fn(),
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/reminders/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { sendAssessmentInvitationEmail } from "@/services/notifications";

const coachActor = {
  userId: "u1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const baseCampaign = {
  id: "c1",
  organizationId: "org-1",
  templateId: "tpl-1",
  createdByCoachId: "coach-1",
  status: "ACTIVE" as const,
  externalId: null as string | null,
  alias: "demo",
  name: "Demo",
  closeAt: null as Date | null,
  invitationSubject: null as string | null,
  invitationBodyMarkdown: null as string | null,
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
};

const ACTIVE_PARTICIPANTS = [
  {
    respondentId: "r1",
    respondent: {
      id: "r1",
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@example.com",
      deletedAt: null,
    },
  },
  {
    respondentId: "r2",
    respondent: {
      id: "r2",
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@example.com",
      deletedAt: null,
    },
  },
];

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonReq(body: unknown): Request {
  return new Request(
    "http://localhost/api/assessment-campaigns/c1/reminders",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

function emptyReq(): Request {
  return new Request(
    "http://localhost/api/assessment-campaigns/c1/reminders",
    { method: "POST" }
  );
}

function pendingInvitation(respondentId: string) {
  return {
    id: `inv-${respondentId}`,
    campaignId: "c1",
    respondentId,
    status: "SENT" as const,
    revokedAt: null,
    submittedAt: null,
    tokenHash: "x",
    expiresAt: new Date(Date.now() + 86400_000),
  };
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
  (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
    (args) => {
      if (args?.include) {
        return Promise.resolve({
          ...baseCampaign,
          participants: ACTIVE_PARTICIPANTS,
        });
      }
      return Promise.resolve(baseCampaign);
    }
  );
  (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
    pendingInvitation("r1"),
    pendingInvitation("r2"),
  ]);
  (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentInvitation.update as jest.Mock).mockImplementation(
    (args) =>
      Promise.resolve({
        id: args.where.id,
        expiresAt: new Date(Date.now() + 86400_000),
      })
  );
  (sendAssessmentInvitationEmail as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /api/assessment-campaigns/[id]/reminders", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(401);
  });

  it("404 when canManageCampaign denies (auth-fail hidden as 404)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      ...coachActor,
      coachId: "coach-OTHER",
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(404);
  });

  it("409 CAMPAIGN_NOT_ACTIVE when campaign is DRAFT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({
            ...baseCampaign,
            status: "DRAFT",
            participants: ACTIVE_PARTICIPANTS,
          });
        }
        return Promise.resolve({ ...baseCampaign, status: "DRAFT" });
      }
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CAMPAIGN_NOT_ACTIVE");
  });

  it("409 when campaign is CLOSED — no email sent (defense-in-depth)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({
            ...baseCampaign,
            status: "CLOSED",
            participants: ACTIVE_PARTICIPANTS,
          });
        }
        return Promise.resolve({ ...baseCampaign, status: "CLOSED" });
      }
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
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
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({
            ...baseCampaign,
            status: "ACTIVE",
            externalId: "esperto:ABC123",
            participants: ACTIVE_PARTICIPANTS,
          });
        }
        return Promise.resolve({
          ...baseCampaign,
          status: "ACTIVE",
          externalId: "esperto:ABC123",
        });
      }
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Cannot send invitations for a closed or imported campaign"
    );
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("happy bulk path: reminds all non-submitted participants", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { sent: number; skipped: number; failed: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.sent).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.failed).toHaveLength(0);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(2);
    expect(db.assessmentInvitation.update).toHaveBeenCalledTimes(2);
  });

  it("single-participant path: only targets supplied IDs", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; skipped: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(1);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
  });

  it("skips participants who already submitted (via AssessmentSubmission row)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentSubmission.findMany as jest.Mock).mockResolvedValue([
      { respondentId: "r1" },
    ]);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; skipped: number };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
  });

  it("skips participants with SUBMITTED invitation status", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      { ...pendingInvitation("r1"), status: "SUBMITTED", submittedAt: new Date() },
      pendingInvitation("r2"),
    ]);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; skipped: number };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.skipped).toBe(1);
  });

  it("skips participants with no invitation row yet", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      pendingInvitation("r1"),
    ]);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; skipped: number };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.skipped).toBe(1);
  });

  it("SMTP failure on one participant continues with the next", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (sendAssessmentInvitationEmail as jest.Mock)
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(undefined);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        sent: number;
        skipped: number;
        failed: Array<{ participantId: string; reason: string }>;
      };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.failed).toHaveLength(1);
    expect(body.data.failed[0].reason).toBe("smtp-failed");
  });

  it("all-skipped path: returns 200 with zero sent and no error", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // No participants on the campaign at all.
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({ ...baseCampaign, participants: [] });
        }
        return Promise.resolve(baseCampaign);
      }
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { sent: number; skipped: number; failed: unknown[] };
    };
    expect(body.success).toBe(true);
    expect(body.data.sent).toBe(0);
    expect(body.data.skipped).toBe(0);
    expect(body.data.failed).toHaveLength(0);
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
  });

  // Task O — per-campaign invitation email overrides
  it("Task O — campaign overrides take precedence over template defaults", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const customCampaign = {
      ...baseCampaign,
      invitationSubject: "Custom subject here",
      invitationBodyMarkdown: "Custom body for {{respondentFirstName}}",
    };
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({
            ...customCampaign,
            participants: ACTIVE_PARTICIPANTS,
          });
        }
        return Promise.resolve(customCampaign);
      },
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const calls = (sendAssessmentInvitationEmail as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].template.invitationSubject).toBe(
      "Custom subject here",
    );
    expect(calls[0][0].template.invitationBodyMarkdown).toBe(
      "Custom body for {{respondentFirstName}}",
    );
  });

  it("Task O — null overrides fall back to template defaults", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const nullCampaign = {
      ...baseCampaign,
      invitationSubject: null,
      invitationBodyMarkdown: null,
    };
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({
            ...nullCampaign,
            participants: ACTIVE_PARTICIPANTS,
          });
        }
        return Promise.resolve(nullCampaign);
      },
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const calls = (sendAssessmentInvitationEmail as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0].template.invitationSubject).toBe(
      "Take the assessment",
    );
    expect(calls[0][0].template.invitationBodyMarkdown).toBe(
      "Hi {{respondentFirstName}}",
    );
  });

  it("forwards organizationName, coachName, and templateName to the email", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const calls = (sendAssessmentInvitationEmail as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toEqual(
      expect.objectContaining({
        organizationName: "Acme Corp",
        coachName: "Pat Coach",
        templateName: "Five Dysfunctions",
      })
    );
  });

  it("does NOT rotate the token when the send fails (old link stays valid)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // Target a single participant and fail its send.
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValue(
      new Error("smtp down")
    );
    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(0);
    expect(body.data.failed).toHaveLength(1);
    // The token-rotating update must NOT have run for the failed send — the
    // prior token (and the recipient's existing link) stays valid.
    expect(db.assessmentInvitation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: expect.anything() }),
      })
    );
  });

  it("caps the batch at MAX_REMINDER_BATCH and reports remaining", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const COUNT = 205;
    const many = Array.from({ length: COUNT }, (_, i) => ({
      respondentId: `r${i}`,
      respondent: {
        id: `r${i}`,
        firstName: "F",
        lastName: "L",
        email: `r${i}@example.com`,
        deletedAt: null,
      },
    }));
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation(
      (args) => {
        if (args?.include) {
          return Promise.resolve({ ...baseCampaign, participants: many });
        }
        return Promise.resolve(baseCampaign);
      }
    );
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue(
      many.map((p) => pendingInvitation(p.respondentId))
    );
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sent: number; remaining: number };
    };
    expect(body.data.sent).toBeLessThanOrEqual(200);
    expect(body.data.remaining).toBe(COUNT - 200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(200);
  });
});
