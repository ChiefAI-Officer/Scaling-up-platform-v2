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
  confirmStableInvitationToken: jest.fn(),
  markStableInvitationTokenUncertain: jest.fn(),
  rollbackRejectedStableInvitationToken: jest.fn(),
  classifyInvitationSendError: jest.fn().mockReturnValue("UNCERTAIN"),
}));

import { POST } from "@/app/api/assessment-campaigns/[id]/reminders/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  classifyInvitationSendError,
  confirmStableInvitationToken,
  markStableInvitationTokenUncertain,
  rollbackRejectedStableInvitationToken,
  stageStableInvitationToken,
} from "@/lib/assessments/stable-invitation-tokens";
import { isStableInvitationLinksEnabled } from "@/lib/assessments/wave-j65-flags";
import { hashToken } from "@/lib/assessments/invitation-tokens";
import {
  prepareAssessmentInvitationEmail,
  sendAssessmentInvitationEmail,
} from "@/services/notifications";

const mockIsStableInvitationLinksEnabled = jest.mocked(
  isStableInvitationLinksEnabled
);
const mockClassifyInvitationSendError = jest.mocked(
  classifyInvitationSendError
);
const mockStageStableInvitationToken = jest.mocked(
  stageStableInvitationToken
);
const mockConfirmStableInvitationToken = jest.mocked(
  confirmStableInvitationToken
);
const mockMarkStableInvitationTokenUncertain = jest.mocked(
  markStableInvitationTokenUncertain
);
const mockRollbackRejectedStableInvitationToken = jest.mocked(
  rollbackRejectedStableInvitationToken
);
const mockPrepareAssessmentInvitationEmail = jest.mocked(
  prepareAssessmentInvitationEmail
);

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

function capturedLogText(calls: unknown[][]): string {
  return calls
    .flat()
    .map((value) =>
      value instanceof Error
        ? `${value.name}:${value.message}:${value.stack ?? ""}`
        : JSON.stringify(value)
    )
    .join("\n");
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
  mockIsStableInvitationLinksEnabled.mockReturnValue(false);
  mockClassifyInvitationSendError.mockReturnValue("UNCERTAIN");
  mockStageStableInvitationToken.mockImplementation(
    async (_database, input) => ({
      tokenId: `stable-${input.invitationId}`,
      invitationId: input.invitationId,
      newTokenHash: input.newTokenHash,
      previousTokenHash: "a".repeat(64),
      previousExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
    })
  );
  mockConfirmStableInvitationToken.mockResolvedValue(undefined);
  mockMarkStableInvitationTokenUncertain.mockResolvedValue(undefined);
  mockRollbackRejectedStableInvitationToken.mockResolvedValue(undefined);
  mockPrepareAssessmentInvitationEmail.mockImplementation(
    (payload) =>
      ({
        send: () => sendAssessmentInvitationEmail(payload),
      }) as ReturnType<typeof prepareAssessmentInvitationEmail>
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

  it.each([false, true])(
    "caps the batch at 200 and reports remaining (stable links: %s)",
    async (stableLinksEnabled) => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      mockIsStableInvitationLinksEnabled.mockReturnValue(stableLinksEnabled);
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
      if (stableLinksEnabled) {
        expect(mockStageStableInvitationToken).toHaveBeenCalledTimes(200);
        expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(200);
        expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
      }
    }
  );

  it("stages, sends, and confirms one stable reminder by token identity when enabled", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    const consoleLog = jest
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockIsStableInvitationLinksEnabled).toHaveBeenCalledTimes(1);
    expect(mockIsStableInvitationLinksEnabled).toHaveBeenCalledWith("demo");
    expect(mockStageStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        invitationId: "inv-r1",
        source: "REMINDER",
      })
    );
    const stagedHash =
      mockStageStableInvitationToken.mock.calls[0][1].newTokenHash;
    const emailedRawToken = (sendAssessmentInvitationEmail as jest.Mock).mock
      .calls[0][0].rawToken as string;
    expect(stagedHash).toBe(hashToken(emailedRawToken));
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tokenId: "stable-inv-r1",
        invitationId: "inv-r1",
        reminder: true,
      })
    );
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(1);
    expect(
      mockPrepareAssessmentInvitationEmail.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockStageStableInvitationToken.mock.invocationCallOrder[0]
    );
    expect(
      mockStageStableInvitationToken.mock.invocationCallOrder[0]
    ).toBeLessThan(
      (sendAssessmentInvitationEmail as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(
      (sendAssessmentInvitationEmail as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      mockConfirmStableInvitationToken.mock.invocationCallOrder[0]
    );
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { sent: number; skipped: number; failed: unknown[] };
    };
    expect(body.data).toEqual({
      sent: 1,
      skipped: 0,
      failed: [],
      remaining: 0,
    });
    const observableText = JSON.stringify({
      response: body,
      logs: [...consoleLog.mock.calls, ...consoleError.mock.calls],
      audits: (db.auditLog.create as jest.Mock).mock.calls,
    });
    expect(observableText).not.toContain(emailedRawToken);
    expect(observableText).not.toContain(stagedHash);
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  it("marks an unclassified send failure uncertain without leaking token material", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock).mockImplementationOnce(
      async (payload) => {
        const stagedHash =
          mockStageStableInvitationToken.mock.calls[0][1].newTokenHash;
        const error = new Error(`smtp transport echoed ${payload.rawToken}`);
        error.name = `ProviderFailure-${stagedHash}`;
        throw error;
      }
    );

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockMarkStableInvitationTokenUncertain).toHaveBeenCalledWith(
      db,
      "stable-inv-r1"
    );
    expect(mockRollbackRejectedStableInvitationToken).not.toHaveBeenCalled();
    expect(mockConfirmStableInvitationToken).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: {
        sent: number;
        skipped: number;
        failed: Array<{ participantId: string; reason: string }>;
        remaining: number;
      };
    };
    expect(body.data).toEqual({
      sent: 0,
      skipped: 0,
      failed: [{ participantId: "r1", reason: "smtp-failed" }],
      remaining: 0,
    });
    const emailedRawToken = (sendAssessmentInvitationEmail as jest.Mock).mock
      .calls[0][0].rawToken as string;
    const stagedHash =
      mockStageStableInvitationToken.mock.calls[0][1].newTokenHash;
    const observableText = JSON.stringify({
      response: body,
      logs: capturedLogText(consoleError.mock.calls),
      audits: (db.auditLog.create as jest.Mock).mock.calls,
    });
    expect(observableText).not.toContain(emailedRawToken);
    expect(observableText).not.toContain(stagedHash);
    consoleError.mockRestore();
  });

  it("rolls back a numeric SMTP 5xx rejection through the chain-safe service", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockClassifyInvitationSendError.mockReturnValueOnce(
      "DEFINITE_REJECTION"
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce({
      responseCode: 550,
      message: "mailbox unavailable",
    });

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockClassifyInvitationSendError).toHaveBeenCalledWith(
      expect.objectContaining({ responseCode: 550 })
    );
    expect(mockRollbackRejectedStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tokenId: "stable-inv-r1",
        invitationId: "inv-r1",
        previousTokenHash: "a".repeat(64),
      })
    );
    expect(mockMarkStableInvitationTokenUncertain).not.toHaveBeenCalled();
    expect(mockConfirmStableInvitationToken).not.toHaveBeenCalled();
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(0);
    expect(body.data.failed).toEqual([
      { participantId: "r1", reason: "smtp-failed" },
    ]);
    jest.restoreAllMocks();
  });

  it("retries a transient definite-rejection rollback failure synchronously", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockClassifyInvitationSendError.mockReturnValueOnce(
      "DEFINITE_REJECTION"
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce({
      responseCode: 550,
    });
    mockRollbackRejectedStableInvitationToken
      .mockRejectedValueOnce(new Error("transient database failure"))
      .mockResolvedValueOnce(undefined);

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockRollbackRejectedStableInvitationToken).toHaveBeenCalledTimes(2);
    expect(mockRollbackRejectedStableInvitationToken).toHaveBeenNthCalledWith(
      2,
      db,
      expect.objectContaining({
        tokenId: "stable-inv-r1",
        invitationId: "inv-r1",
      })
    );
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data).toEqual(
      expect.objectContaining({
        sent: 0,
        failed: [{ participantId: "r1", reason: "smtp-failed" }],
      })
    );
    jest.restoreAllMocks();
  });

  it("signals exhausted definite-rejection rollback retries in response and durable audit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    mockClassifyInvitationSendError.mockReturnValueOnce(
      "DEFINITE_REJECTION"
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock).mockRejectedValueOnce({
      responseCode: 550,
    });
    mockRollbackRejectedStableInvitationToken.mockRejectedValue(
      new Error("database unavailable")
    );

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockRollbackRejectedStableInvitationToken).toHaveBeenCalledTimes(3);
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data).toEqual(
      expect.objectContaining({
        sent: 0,
        failed: [
          {
            participantId: "r1",
            reason: "smtp-rejected-rollback-failed",
          },
        ],
      })
    );
    const auditChanges = (db.auditLog.create as jest.Mock).mock.calls.at(-1)[0]
      .data.changes as string;
    expect(auditChanges).toContain(
      '"failureReasons":{"smtp-rejected-rollback-failed":1}'
    );
    jest.restoreAllMocks();
  });

  it("reports a staging failure per recipient and sends no email", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockStageStableInvitationToken.mockImplementationOnce(
      async (_database, input) => {
        const rawToken =
          mockPrepareAssessmentInvitationEmail.mock.calls[0][0].rawToken;
        const error = new Error(`database rejected ${input.newTokenHash}`);
        error.name = `StageFailure-${rawToken}`;
        throw error;
      }
    );

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(mockConfirmStableInvitationToken).not.toHaveBeenCalled();
    expect(mockMarkStableInvitationTokenUncertain).not.toHaveBeenCalled();
    expect(mockRollbackRejectedStableInvitationToken).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { sent: number; skipped: number; failed: unknown[]; remaining: number };
    };
    expect(body.data).toEqual({
      sent: 0,
      skipped: 0,
      failed: [{ participantId: "r1", reason: "token-stage-failed" }],
      remaining: 0,
    });
    expect(capturedLogText(consoleError.mock.calls)).not.toContain(
      mockStageStableInvitationToken.mock.calls[0][1].newTokenHash
    );
    expect(capturedLogText(consoleError.mock.calls)).not.toContain(
      mockPrepareAssessmentInvitationEmail.mock.calls[0][0].rawToken
    );
    consoleError.mockRestore();
  });

  it("reports deterministic preparation failure before staging or provider handoff", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockPrepareAssessmentInvitationEmail.mockImplementationOnce(() => {
      throw new Error("invalid rendered invitation");
    });

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockPrepareAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockStageStableInvitationToken).not.toHaveBeenCalled();
    expect(sendAssessmentInvitationEmail).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(0);
    expect(body.data.failed).toEqual([
      { participantId: "r1", reason: "email-prepare-failed" },
    ]);
    jest.restoreAllMocks();
  });

  it("counts an accepted email as sent when token confirmation persistence fails", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockConfirmStableInvitationToken.mockRejectedValueOnce(
      new Error("telemetry write failed")
    );

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(1);
    expect(mockMarkStableInvitationTokenUncertain).not.toHaveBeenCalled();
    expect(mockRollbackRejectedStableInvitationToken).not.toHaveBeenCalled();
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.failed).toEqual([]);
    const emailedRawToken = (sendAssessmentInvitationEmail as jest.Mock).mock
      .calls[0][0].rawToken as string;
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      emailedRawToken
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      hashToken(emailedRawToken)
    );
    consoleError.mockRestore();
  });

  it("keeps the exact parent-only send-first flow when the gate is off or killed", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(false);

    const res = await POST(
      jsonReq({ participantIds: ["r1"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockIsStableInvitationLinksEnabled).toHaveBeenCalledTimes(1);
    expect(mockIsStableInvitationLinksEnabled).toHaveBeenCalledWith("demo");
    expect(mockPrepareAssessmentInvitationEmail).not.toHaveBeenCalled();
    expect(mockStageStableInvitationToken).not.toHaveBeenCalled();
    expect(mockConfirmStableInvitationToken).not.toHaveBeenCalled();
    expect(mockMarkStableInvitationTokenUncertain).not.toHaveBeenCalled();
    expect(mockRollbackRejectedStableInvitationToken).not.toHaveBeenCalled();
    const emailedRawToken = (sendAssessmentInvitationEmail as jest.Mock).mock
      .calls[0][0].rawToken as string;
    expect(db.assessmentInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-r1" },
        data: expect.objectContaining({
          tokenHash: hashToken(emailedRawToken),
          resentCount: { increment: 1 },
          lastResentAt: expect.any(Date),
        }),
      })
    );
    expect(
      (sendAssessmentInvitationEmail as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (db.assessmentInvitation.update as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it("stages distinct token hashes for two targeted participants", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);

    const res = await POST(
      jsonReq({ participantIds: ["r1", "r2"] }) as never,
      detailParams("c1")
    );

    expect(res.status).toBe(200);
    expect(mockStageStableInvitationToken).toHaveBeenCalledTimes(2);
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(2);
    const stagedHashes = mockStageStableInvitationToken.mock.calls.map(
      ([, input]) => input.newTokenHash
    );
    const rawTokens = (sendAssessmentInvitationEmail as jest.Mock).mock.calls.map(
      ([payload]) => payload.rawToken as string
    );
    expect(new Set(stagedHashes).size).toBe(2);
    expect(stagedHashes).toEqual(rawTokens.map(hashToken));
    const body = (await res.json()) as {
      data: { sent: number; skipped: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.failed).toEqual([]);
  });

  it("continues a mixed stable batch after one uncertain recipient failure", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock)
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(undefined);

    const res = await POST(emptyReq() as never, detailParams("c1"));

    expect(res.status).toBe(200);
    expect(mockStageStableInvitationToken).toHaveBeenCalledTimes(2);
    expect(mockMarkStableInvitationTokenUncertain).toHaveBeenCalledWith(
      db,
      "stable-inv-r1"
    );
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        tokenId: "stable-inv-r2",
        invitationId: "inv-r2",
        reminder: true,
      })
    );
    const body = (await res.json()) as {
      data: {
        sent: number;
        skipped: number;
        failed: unknown[];
        remaining: number;
      };
    };
    expect(body.data).toEqual({
      sent: 1,
      skipped: 0,
      failed: [{ participantId: "r1", reason: "smtp-failed" }],
      remaining: 0,
    });
    jest.restoreAllMocks();
  });

  it("continues the batch when uncertain-state persistence fails without leaking the hash", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (sendAssessmentInvitationEmail as jest.Mock)
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(undefined);
    mockMarkStableInvitationTokenUncertain.mockImplementationOnce(async () => {
      const stagedHash =
        mockStageStableInvitationToken.mock.calls[0][1].newTokenHash;
      throw new Error(`persistence echoed ${stagedHash}`);
    });

    const res = await POST(emptyReq() as never, detailParams("c1"));

    expect(res.status).toBe(200);
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(2);
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as {
      data: { sent: number; failed: unknown[] };
    };
    expect(body.data.sent).toBe(1);
    expect(body.data.failed).toEqual([
      { participantId: "r1", reason: "smtp-failed" },
    ]);
    const stagedHash =
      mockStageStableInvitationToken.mock.calls[0][1].newTokenHash;
    expect(capturedLogText(consoleError.mock.calls)).not.toContain(stagedHash);
    consoleError.mockRestore();
  });

  it("delegates overlapping reminder attempts for one invitation to the stateful service", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    mockIsStableInvitationLinksEnabled.mockReturnValue(true);
    let attempt = 0;
    mockStageStableInvitationToken.mockImplementation(
      async (_database, input) => ({
        tokenId: `overlap-${++attempt}`,
        invitationId: input.invitationId,
        newTokenHash: input.newTokenHash,
        previousTokenHash: "b".repeat(64),
        previousExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      })
    );

    const [first, second] = await Promise.all([
      POST(
        jsonReq({ participantIds: ["r1"] }) as never,
        detailParams("c1")
      ),
      POST(
        jsonReq({ participantIds: ["r1"] }) as never,
        detailParams("c1")
      ),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockStageStableInvitationToken).toHaveBeenCalledTimes(2);
    expect(
      mockStageStableInvitationToken.mock.calls.map(
        ([, input]) => input.invitationId
      )
    ).toEqual(["inv-r1", "inv-r1"]);
    expect(
      new Set(
        mockStageStableInvitationToken.mock.calls.map(
          ([, input]) => input.newTokenHash
        )
      ).size
    ).toBe(2);
    expect(mockConfirmStableInvitationToken).toHaveBeenCalledTimes(2);
    expect(db.assessmentInvitation.update).not.toHaveBeenCalled();
  });
});

// ── Wave P — invitation-email chrome wiring (flag → mailer) ─────────────────
describe("POST /reminders — Wave P chrome + coach logo wiring", () => {
  const FLAG = "WAVE_P_INVITE_EMAIL_ENABLED";
  afterEach(() => {
    delete process.env[FLAG];
  });

  function mockCampaignWith(overrides: Record<string, unknown>) {
    const campaign = { ...baseCampaign, ...overrides };
    (db.assessmentCampaign.findUnique as jest.Mock).mockImplementation((args) =>
      Promise.resolve(
        args?.include
          ? { ...campaign, participants: ACTIVE_PARTICIPANTS }
          : campaign
      )
    );
  }

  it("flag ON: every reminder send receives chrome=waveP + the CREATOR coach's profileImage", async () => {
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
    expect(sendAssessmentInvitationEmail).toHaveBeenCalledTimes(2);
    for (const [payload] of (sendAssessmentInvitationEmail as jest.Mock).mock.calls) {
      expect(payload).toEqual(
        expect.objectContaining({
          chrome: "waveP",
          coachLogoUrl: "https://blob.example.com/pat.png",
        })
      );
    }
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
