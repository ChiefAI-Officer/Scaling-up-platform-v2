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

jest.mock("@/services/notifications", () => {
  const sendAssessmentInvitationEmail = jest.fn();
  return {
    sendAssessmentInvitationEmail,
    prepareAssessmentInvitationEmail: jest.fn((payload) => ({
      send: () => sendAssessmentInvitationEmail(payload),
    })),
  };
});

jest.mock("@/lib/assessments/wave-j65-flags", () => ({
  isStableInvitationLinksEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/assessments/stable-invitation-tokens", () => ({
  stageStableInvitationToken: jest.fn(),
  registerNewOriginalToken: jest.fn(),
  confirmStableInvitationToken: jest.fn(),
  markStableInvitationTokenUncertain: jest.fn(),
  removeRegisteredStableInvitationToken: jest.fn(),
  rollbackRejectedStableInvitationToken: jest.fn(),
  classifyInvitationSendError: jest.fn((error) => {
    const responseCode = error?.responseCode;
    return typeof responseCode === "number" &&
      responseCode >= 500 &&
      responseCode <= 599
      ? "DEFINITE_REJECTION"
      : "UNCERTAIN";
  }),
}));

// Wave-D auto-send flag. The early-send 409 gate must ONLY apply when auto-send
// is ON; default ON in this suite so the existing gate tests pass unchanged.
// The flag-off composition test flips it to false.
const flags = { autoSend: true };
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDAutoSendEnabled: () => flags.autoSend,
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/invite/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  prepareAssessmentInvitationEmail,
  sendAssessmentInvitationEmail,
} from "@/services/notifications";
import { isStableInvitationLinksEnabled } from "@/lib/assessments/wave-j65-flags";
import {
  confirmStableInvitationToken,
  registerNewOriginalToken,
  removeRegisteredStableInvitationToken,
  stageStableInvitationToken,
} from "@/lib/assessments/stable-invitation-tokens";

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
    alias: "five-dysfunctions",
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
  flags.autoSend = true;
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
  (db.auditLog.create as jest.Mock).mockResolvedValue(undefined);
  (sendAssessmentInvitationEmail as jest.Mock).mockResolvedValue(undefined);
  (prepareAssessmentInvitationEmail as jest.Mock).mockImplementation(
    (payload) => ({
      send: () => sendAssessmentInvitationEmail(payload),
    }),
  );
  (isStableInvitationLinksEnabled as jest.Mock).mockReturnValue(false);
  (registerNewOriginalToken as jest.Mock).mockResolvedValue({
    tokenId: "stable-original-r1",
  });
  (confirmStableInvitationToken as jest.Mock).mockResolvedValue(undefined);
  (removeRegisteredStableInvitationToken as jest.Mock).mockResolvedValue(
    undefined,
  );
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
    expect(isStableInvitationLinksEnabled).toHaveBeenCalledWith("demo");
    expect(prepareAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(registerNewOriginalToken).not.toHaveBeenCalled();
  });

  it("stable links enabled: passes the exact campaign alias and service-backed adapter", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (isStableInvitationLinksEnabled as jest.Mock).mockReturnValue(true);

    const res = await POST(
      jsonReq({ respondentIds: ["r1"] }) as never,
      detailParams("c1"),
    );

    expect(res.status).toBe(200);
    expect(isStableInvitationLinksEnabled).toHaveBeenCalledWith("demo");
    expect(prepareAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
    expect(registerNewOriginalToken).toHaveBeenCalledWith(db, {
      invitationId: "inv-r1",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(confirmStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tokenId: "stable-original-r1",
        invitationId: "inv-r1",
        reminder: false,
      }),
    );
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
    const body = await res.json();
    const rawToken = (sendAssessmentInvitationEmail as jest.Mock).mock.calls[0][0]
      .rawToken;
    const tokenHash = (registerNewOriginalToken as jest.Mock).mock.calls[0][1]
      .tokenHash;
    const observableOutput = JSON.stringify({
      body,
      auditWrites: (db.auditLog.create as jest.Mock).mock.calls,
    });
    expect(observableOutput).not.toContain(rawToken);
    expect(observableOutput).not.toContain(tokenHash);
    expect(observableOutput).not.toContain("rawToken");
    expect(observableOutput).not.toContain("tokenHash");
  });

  it("stable links enabled: returns 503 when rejected-child cleanup and strict audit both exhaust", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (isStableInvitationLinksEnabled as jest.Mock).mockReturnValue(true);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValue({
      responseCode: 550,
    });
    (removeRegisteredStableInvitationToken as jest.Mock).mockRejectedValue(
      new Error("cleanup failure with secret"),
    );
    (db.auditLog.create as jest.Mock).mockRejectedValue(
      new Error("audit failure with secret"),
    );
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      jsonReq({ respondentIds: ["r1"] }) as never,
      detailParams("c1"),
    );

    expect(res.status).toBe(503);
    expect(removeRegisteredStableInvitationToken).toHaveBeenCalledTimes(3);
    expect(db.auditLog.create).toHaveBeenCalledTimes(3);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to persist invitation cleanup audit",
    });
    const observableOutput = JSON.stringify({
      body,
      auditWrites: (db.auditLog.create as jest.Mock).mock.calls,
    });
    expect(observableOutput).not.toContain("rawToken");
    expect(observableOutput).not.toContain("tokenHash");
    expect(errorSpy.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ message: expect.stringContaining("secret") }),
    );
    errorSpy.mockRestore();
  });

  it("stable links enabled: a PENDING retry delegates ORIGINAL stage rotation", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (isStableInvitationLinksEnabled as jest.Mock).mockReturnValue(true);
    (db.assessmentInvitation.findMany as jest.Mock).mockResolvedValue([
      {
        id: "inv-r1",
        respondentId: "r1",
        status: "PENDING",
        revokedAt: null,
      },
    ]);
    (stageStableInvitationToken as jest.Mock).mockResolvedValue({
      tokenId: "rotated-r1",
      invitationId: "inv-r1",
      newTokenHash: "a".repeat(64),
      previousTokenHash: "b".repeat(64),
      previousExpiresAt: new Date("2026-06-30T00:00:00.000Z"),
    });

    const res = await POST(
      jsonReq({ respondentIds: ["r1"] }) as never,
      detailParams("c1"),
    );

    expect(res.status).toBe(200);
    expect(stageStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        invitationId: "inv-r1",
        newTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
        source: "ORIGINAL",
      }),
    );
    expect(registerNewOriginalToken).not.toHaveBeenCalled();
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

  // ── Dark-merge fix: the early-send gate is auto-send-flag-gated ───────────
  it("flag OFF + invitesSentAt NULL → manual bulk send WORKS (no 409 strand)", async () => {
    // With auto-send OFF (the default merge state) there is NO automatic
    // initial send to defer to, so the manual /invite must work for an unsent
    // campaign exactly as on origin/main. A permanent 409 here would strand the
    // coach: they could never send the initial invitations.
    flags.autoSend = false;
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: Array<{ respondentId: string; status: string }>;
    };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(2);
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

// ── Wave P — invitation-email chrome wiring (flag → mailer) ─────────────────
describe("POST /invite — Wave P chrome + coach logo wiring", () => {
  const FLAG = "WAVE_P_INVITE_EMAIL_ENABLED";
  afterEach(() => {
    delete process.env[FLAG];
  });

  function mockCampaignWith(overrides: Record<string, unknown>) {
    const campaign = { ...baseCampaign, ...overrides };
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) =>
      Promise.resolve(
        args?.include ? { ...campaign, participants: [PARTICIPANTS[0]] } : campaign
      )
    );
  }

  it("flag ON: mailer receives chrome=waveP + the CREATOR coach's profileImage", async () => {
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockCampaignWith({
      creatorCoach: {
        firstName: "Pat",
        lastName: "Coach",
        profileImage: "https://blob.example.com/pat.png",
      },
      organization: {
        name: "Acme Corp",
        owner: {
          firstName: "Owner",
          lastName: "Coach",
          profileImage: "https://blob.example.com/owner.png",
        },
      },
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: "waveP",
        coachLogoUrl: "https://blob.example.com/pat.png",
      })
    );
  });

  it("creatorCoach=null + org owner present: the OWNER's profileImage is used", async () => {
    process.env[FLAG] = "1";
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockCampaignWith({
      creatorCoach: null,
      organization: {
        name: "Acme Corp",
        owner: {
          firstName: "Owner",
          lastName: "Coach",
          profileImage: "https://blob.example.com/owner.png",
        },
      },
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        chrome: "waveP",
        coachLogoUrl: "https://blob.example.com/owner.png",
      })
    );
  });

  it("flag OFF (default): mailer receives chrome=legacy", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockCampaignWith({
      creatorCoach: {
        firstName: "Pat",
        lastName: "Coach",
        profileImage: "https://blob.example.com/pat.png",
      },
    });
    const res = await POST(emptyReq() as never, detailParams("c1"));
    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ chrome: "legacy" })
    );
  });
});
