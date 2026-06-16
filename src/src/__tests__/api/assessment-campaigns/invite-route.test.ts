/**
 * Assessment v7.6 — POST /api/assessment-campaigns/[id]/invite.
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
      create: jest.fn(),
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

import { POST } from "@/app/api/assessment-campaigns/[id]/invite/route";
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
  // Wave D (R1-M6): the manual route is the LATE-ADD / resend path. A legitimate
  // call targets a campaign whose initial auto-send already completed, so the
  // fixture has invitesSentAt set. The early-send gate (invitesSentAt IS NULL)
  // is exercised by its own test below.
  invitesSentAt: new Date("2026-06-15T00:00:00.000Z") as Date | null,
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

const PARTICIPANTS = [
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
  return new Request("http://localhost/api/assessment-campaigns/c1/invite", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function emptyReq(): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1/invite", {
    method: "POST",
  });
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
  // First call: canManageCampaign. Second call: route fetch with include.
  (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) => {
    if (args?.include) {
      return Promise.resolve({
        ...baseCampaign,
        participants: [
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
        ],
      });
    }
    return Promise.resolve(baseCampaign);
  });
  (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentInvitation.create as jest.Mock).mockImplementation((args) =>
    Promise.resolve({
      id: "inv-" + args.data.respondentId,
      expiresAt: args.data.expiresAt,
    })
  );
  (db.assessmentInvitation.update as jest.Mock).mockResolvedValue({});
  (sendAssessmentInvitationEmail as jest.Mock).mockResolvedValue(undefined);
});

describe("POST /api/assessment-campaigns/[id]/invite", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(401);
  });

  it("403 when not the creator coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      ...coachActor,
      coachId: "coach-OTHER",
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(403);
  });

  it("400 when batch > 25", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    // Stub: campaign has 30 participants.
    const big = Array.from({ length: 30 }, (_, i) => ({
      respondentId: `r${i}`,
      respondent: {
        id: `r${i}`,
        firstName: "F",
        lastName: "L",
        email: `r${i}@example.com`,
        deletedAt: null,
      },
    }));
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) => {
      if (args?.include) return Promise.resolve({ ...baseCampaign, participants: big });
      return Promise.resolve(baseCampaign);
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Split");
  });

  it("happy path: invites all active participants", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: Array<{ respondentId: string; status: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((r) => r.status === "sent")).toBe(true);
    expect(db.assessmentInvitation.create).toHaveBeenCalledTimes(2);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(2);
    // Status flipped to SENT after send.
    expect(db.assessmentInvitation.update).toHaveBeenCalledTimes(2);
  });

  it("idempotent re-call: existing SENT row reports already-invited", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      {
        id: "inv-r1",
        campaignId: "c1",
        respondentId: "r1",
        status: "SENT",
        revokedAt: null,
        tokenHash: "x",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    ]);
    const res = await POST(jsonReq({ respondentIds: ["r1"] }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ respondentId: string; status: string }>;
    };
    expect(body.data[0].status).toBe("already-invited");
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
  });

  it("send-failed when SMTP throws — row stays PENDING", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce(
      new Error("smtp down")
    );
    const res = await POST(jsonReq({ respondentIds: ["r1"] }) as never, detailParams("c1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ respondentId: string; status: string }>;
    };
    expect(body.data[0].status).toBe("send-failed");
    // The follow-up update to SENT must not be called for the failed send.
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("409 when campaign is CLOSED — no email sent (defense-in-depth)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) => {
      if (args?.include) {
        return Promise.resolve({
          ...baseCampaign,
          status: "CLOSED",
          participants: PARTICIPANTS,
        });
      }
      return Promise.resolve({ ...baseCampaign, status: "CLOSED" });
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Cannot send invitations for a closed or imported campaign"
    );
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.create).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("409 when campaign was imported (externalId set) — no email sent", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) => {
      if (args?.include) {
        return Promise.resolve({
          ...baseCampaign,
          status: "ACTIVE",
          externalId: "esperto:ABC123",
          participants: PARTICIPANTS,
        });
      }
      return Promise.resolve({
        ...baseCampaign,
        status: "ACTIVE",
        externalId: "esperto:ABC123",
      });
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "Cannot send invitations for a closed or imported campaign"
    );
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.create).not.toHaveBeenCalled();
  });

  it("forwards organizationName, coachName, and templateName to the email", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ respondentIds: ["r1"] }) as never,
      detailParams("c1")
    );
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: "Acme Corp",
        coachName: "Pat Coach",
        templateName: "Five Dysfunctions",
      })
    );
  });

  // ── Wave D (R1-M6): early-send gate ──────────────────────────────────────
  it("409 when invitesSentAt IS NULL — bulk early-send is disabled (use auto-send)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) => {
      if (args?.include) {
        return Promise.resolve({
          ...baseCampaign,
          invitesSentAt: null,
          participants: PARTICIPANTS,
        });
      }
      return Promise.resolve({ ...baseCampaign, invitesSentAt: null });
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/automatically|disabled/i);
    // No row written, no email sent — the gate runs before any send logic.
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.create).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  it("late-add: invitesSentAt set → send works for the targeted recipient", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      jsonReq({ respondentIds: ["r2"] }) as never,
      detailParams("c1")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: Array<{ respondentId: string; status: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ respondentId: "r2", status: "sent" }]);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
  });
});
