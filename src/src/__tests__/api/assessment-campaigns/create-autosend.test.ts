/**
 * Task 9 (Wave D) — Atomic campaign create + post-commit auto-send emit +
 * in-tx participant re-authorization (R1-H1, R3-H2, SEC-M3).
 *
 * A "Wave-D create" is marked by the presence of `inviteTiming` (or `waveD:
 * true`, or a non-empty `participantIds` array). It:
 *   - re-authorizes every submitted participant ID INSIDE the transaction
 *     (every ID must belong to the campaign's org + be non-deleted; the loaded
 *     count must equal the submitted count; the CEO, if any, must be among
 *     them) — anti-IDOR (SEC-M3);
 *   - creates the campaign + attaches participants in ONE db.$transaction
 *     (atomic — a mid-create failure leaves no orphan participants);
 *   - sets lifecycle per timing + flag:
 *       IMMEDIATELY + flag ON → ACTIVE, openAt≈now, emit fan-out post-commit;
 *       ON_OPEN   + flag ON + future openAt → DRAFT, no emit (cron sends);
 *       ON_OPEN   + past/now openAt → 400;
 *       flag OFF (even IMMEDIATELY) → DRAFT, no emit (dark launch);
 *   - the fan-out emit is AFTER the tx commits and guarded (a throwing
 *     inngest.send never fails the request — the cron is the backstop).
 *
 * Legacy creates (no Wave-D contract) behave exactly like before: DRAFT, no
 * participant attach here, no emit.
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

jest.mock("@/lib/db", () => {
  const assessmentCampaign = {
    findMany: jest.fn(),
    create: jest.fn(),
  };
  const orgRespondent = { findMany: jest.fn() };
  const orgTeam = { findMany: jest.fn().mockResolvedValue([]) };
  const assessmentCampaignParticipant = {
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  };
  return {
    db: {
      organization: { findUnique: jest.fn() },
      coach: { findUnique: jest.fn() },
      accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
      accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentTemplate: { findUnique: jest.fn() },
      assessmentTemplateVersion: { findFirst: jest.fn() },
      assessmentCampaign,
      orgRespondent,
      orgTeam,
      assessmentCampaignParticipant,
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      // $transaction runs the callback against a tx surface that mirrors db.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          assessmentCampaign,
          orgRespondent,
          orgTeam,
          assessmentCampaignParticipant,
        }),
      ),
    },
  };
});

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

// Wave-D auto-send flag — default ON in this suite; flag-off test flips it.
const flags = { autoSend: true };
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDAutoSendEnabled: () => flags.autoSend,
}));

import { POST } from "@/app/api/assessment-campaigns/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";

// Mirror the fan-out event name without importing the fan-out module (which
// evaluates inngest.createFunction at import time and pulls in the mailer).
// The route is asserted to emit exactly this name.
const ASSESSMENT_SEND_INVITES_EVENT = "assessment/campaign.send-invites";

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

const baseBody = {
  name: "Q3",
  templateId: "tpl-1",
  organizationId: "org-1",
  endMode: "OPEN_END" as const,
};

const future = "2999-01-01T10:00:00Z";
const past = "2000-01-01T10:00:00Z";

beforeEach(() => {
  jest.clearAllMocks();
  flags.autoSend = true;
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
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
  (db.assessmentCampaign.create as jest.Mock).mockImplementation((args) =>
    Promise.resolve({
      id: "c1",
      alias: args?.data?.alias ?? "acme_rockefeller_x",
      status: args?.data?.status ?? "DRAFT",
      openAt: args?.data?.openAt ?? new Date(),
      inviteTiming: args?.data?.inviteTiming ?? "IMMEDIATELY",
      templateId: "tpl-1",
      versionId: "ver-1",
      organizationId: "org-1",
    }),
  );
  (db.orgTeam.findMany as jest.Mock).mockResolvedValue([]);
  (db.assessmentCampaignParticipant.create as jest.Mock).mockImplementation((args) =>
    Promise.resolve({
      id: "p-" + args.data.respondentId,
      respondentId: args.data.respondentId,
      isCEO: args.data.isCEO,
    }),
  );
  (db.assessmentCampaignParticipant.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  // Default: every queried org respondent exists & belongs to org-1 (the
  // re-auth query returns exactly the requested IDs). Tests that need a
  // foreign/missing ID override this mock to return a SHORT list.
  (db.orgRespondent.findMany as jest.Mock).mockImplementation((args) => {
    const ids: string[] = args?.where?.id?.in ?? [];
    return Promise.resolve(
      ids.map((id, i) => ({
        id,
        teamId: null,
        firstName: "First" + i,
        lastName: "Last" + i,
        organizationId: "org-1",
        deletedAt: null,
      })),
    );
  });
});

describe("Task 9 — IMMEDIATELY + flag ON", () => {
  it("creates ACTIVE, openAt≈now, emits fan-out post-commit", async () => {
    const before = Date.now();
    const res = await POST(
      jsonReq({ ...baseBody, inviteTiming: "IMMEDIATELY", participantIds: ["r1", "r2"] }) as never,
    );
    expect(res.status).toBe(201);

    // create happened inside the transaction surface
    expect(db.$transaction).toHaveBeenCalled();
    const createArgs = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.status).toBe("ACTIVE");
    const openMs = new Date(createArgs.data.openAt).getTime();
    expect(openMs).toBeGreaterThanOrEqual(before - 1000);
    expect(openMs).toBeLessThanOrEqual(Date.now() + 1000);

    // participants attached
    expect(db.assessmentCampaignParticipant.create).toHaveBeenCalledTimes(2);

    // fan-out emitted post-commit with { campaignId } only
    expect(inngest.send).toHaveBeenCalledWith({
      name: ASSESSMENT_SEND_INVITES_EVENT,
      data: { campaignId: "c1" },
    });
  });
});

describe("Task 9 — ON_OPEN + flag ON", () => {
  it("future openAt → DRAFT, no emit", async () => {
    const res = await POST(
      jsonReq({ ...baseBody, openAt: future, inviteTiming: "ON_OPEN", participantIds: ["r1"] }) as never,
    );
    expect(res.status).toBe(201);
    const createArgs = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.status).toBe("DRAFT");
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("past openAt → 400, no campaign, no emit", async () => {
    const res = await POST(
      jsonReq({ ...baseBody, openAt: past, inviteTiming: "ON_OPEN", participantIds: ["r1"] }) as never,
    );
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("Task 9 — flag OFF (dark)", () => {
  it("IMMEDIATELY with flag OFF → DRAFT, no emit", async () => {
    flags.autoSend = false;
    const res = await POST(
      jsonReq({ ...baseBody, inviteTiming: "IMMEDIATELY", participantIds: ["r1"] }) as never,
    );
    expect(res.status).toBe(201);
    const createArgs = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.status).toBe("DRAFT");
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("Task 9 — legacy payload (no Wave-D contract)", () => {
  it("no inviteTiming → DRAFT, no participant attach, no emit", async () => {
    const res = await POST(
      jsonReq({ ...baseBody, openAt: future }) as never,
    );
    expect(res.status).toBe(201);
    const createArgs = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.status).toBe("DRAFT");
    expect(db.assessmentCampaignParticipant.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("Task 9 — SEC-M3 participant re-authorization", () => {
  it("foreign-org / nonexistent ID (count mismatch) → 400, no campaign, no emit", async () => {
    // Submitted 2 ids, but only 1 belongs to the org → count mismatch.
    (db.orgRespondent.findMany as jest.Mock).mockResolvedValue([
      { id: "r1", teamId: null, firstName: "A", lastName: "One", organizationId: "org-1", deletedAt: null },
    ]);
    const res = await POST(
      jsonReq({
        ...baseBody,
        openAt: future,
        inviteTiming: "ON_OPEN",
        participantIds: ["r1", "foreign-r"],
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("re-auth query scopes to org + non-deleted", async () => {
    await POST(
      jsonReq({
        ...baseBody,
        openAt: future,
        inviteTiming: "ON_OPEN",
        participantIds: ["r1", "r2"],
      }) as never,
    );
    expect(db.orgRespondent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["r1", "r2"] },
          organizationId: "org-1",
          deletedAt: null,
        }),
      }),
    );
  });

  it("CEO not among verified IDs → 400", async () => {
    // Schema-level: ceo not in participantIds. Should 400 before any create.
    const res = await POST(
      jsonReq({
        ...baseBody,
        openAt: future,
        inviteTiming: "ON_OPEN",
        participantIds: ["r1", "r2"],
        ceoRespondentId: "r3",
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("Task 9 — atomicity", () => {
  it("create + attach run inside ONE db.$transaction", async () => {
    await POST(
      jsonReq({ ...baseBody, openAt: future, inviteTiming: "ON_OPEN", participantIds: ["r1", "r2"] }) as never,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("a mid-create failure aborts the tx → no campaign returned, no emit", async () => {
    (db.assessmentCampaignParticipant.create as jest.Mock).mockRejectedValueOnce(
      new Error("boom"),
    );
    const res = await POST(
      jsonReq({ ...baseBody, openAt: future, inviteTiming: "ON_OPEN", participantIds: ["r1", "r2"] }) as never,
    );
    expect(res.status).toBe(500);
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe("Task 9 — guarded emit", () => {
  it("inngest.send throwing still returns 201 (campaign persisted)", async () => {
    (inngest.send as jest.Mock).mockRejectedValueOnce(new Error("inngest down"));
    const res = await POST(
      jsonReq({ ...baseBody, inviteTiming: "IMMEDIATELY", participantIds: ["r1"] }) as never,
    );
    expect(res.status).toBe(201);
  });
});
