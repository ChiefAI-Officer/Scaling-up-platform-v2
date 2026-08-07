/**
 * Wave D — campaign PATCH email-notification settings.
 *
 * These tests pin the route boundary: capability flags decide whether a write is
 * accepted, while respondent-result delivery additionally requires the current
 * template content to carry a live hash-bound approval.
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
  const assessmentCampaign = (() => {
    const findUnique = jest.fn();
    const findFirst = jest.fn((args) => findUnique(args));
    return { findUnique, findFirst, update: jest.fn() };
  })();
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  return {
    db: {
      organization: { findUnique: jest.fn() },
      accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
      accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentTemplateVersion: { findUnique: jest.fn() },
      assessmentCampaign,
      auditLog,
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ assessmentCampaign, auditLog }),
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

jest.mock("@/lib/audit", () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));

import { PATCH } from "@/app/api/assessment-campaigns/[id]/route";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/auth/authorization";
import { resultsEmailContentHash } from "@/lib/assessments/results-email-approval";
import { db } from "@/lib/db";

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

const subject = "Your results";
const body = "Hi {{respondentFirstName}}";

function templateApproval(approved: boolean) {
  return {
    alias: "leadership-vision-alignment",
    resultsEmailSubject: subject,
    resultsEmailBodyMarkdown: body,
    resultsEmailContentApproved: approved,
    resultsEmailContentApprovedHash: approved
      ? resultsEmailContentHash(subject, body)
      : null,
  };
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/assessment-campaigns/c1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const RESULTS_FLAG = "WAVE_D_RESULTS_EMAIL_ENABLED";
const COACH_FLAG = "WAVE_D_COACH_NOTIFY_ENABLED";
const originalResultsFlag = process.env[RESULTS_FLAG];
const originalCoachFlag = process.env[COACH_FLAG];

function mockCampaign(opts: {
  approved?: boolean;
  createdByCoachId?: string;
  notifyCoachOnCompletion?: boolean;
  sendResultsToRespondent?: boolean;
  status?: "DRAFT" | "ACTIVE" | "CLOSED";
} = {}) {
  const row = {
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: opts.createdByCoachId ?? "coach-1",
    status: opts.status ?? "ACTIVE",
    versionId: "ver-1",
    customSlides: null,
    showResultsOnScreen: false,
    sendResultsToRespondent: opts.sendResultsToRespondent ?? false,
    notifyCoachOnCompletion: opts.notifyCoachOnCompletion ?? false,
    template: templateApproval(opts.approved ?? true),
  };
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(row);
  (db.assessmentCampaign.update as jest.Mock).mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => Object.assign(row, data),
  );
  return row;
}

function updateData(): Record<string, unknown> {
  const calls = (db.assessmentCampaign.update as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (db.accessGroupCoach.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", coachId: "coach-1", accessGroup: { id: "g1", deletedAt: null } },
  ]);
  (db.accessGroupTemplate.findMany as jest.Mock).mockResolvedValue([
    { accessGroupId: "g1", templateId: "tpl-1" },
  ]);
  (db.organization.findUnique as jest.Mock).mockResolvedValue({
    id: "org-1",
    ownerCoachId: "coach-1",
    deletedAt: null,
  });
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  delete process.env[RESULTS_FLAG];
  delete process.env[COACH_FLAG];
});

afterAll(() => {
  if (originalResultsFlag === undefined) delete process.env[RESULTS_FLAG];
  else process.env[RESULTS_FLAG] = originalResultsFlag;
  if (originalCoachFlag === undefined) delete process.env[COACH_FLAG];
  else process.env[COACH_FLAG] = originalCoachFlag;
});

it("persists respondent results true only with flag and live approval", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: true, sendResultsToRespondent: false });
  const res = await PATCH(
    patchReq({ sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(200);
  expect(updateData()).toHaveProperty("sendResultsToRespondent", true);
  expect(await res.json()).toMatchObject({
    data: { sendResultsToRespondent: true },
  });
});

it("drops respondent results true when approval is invalid", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: false, sendResultsToRespondent: false });
  await PATCH(
    patchReq({ name: "Renamed", sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(updateData()).not.toHaveProperty("sendResultsToRespondent");
  expect(updateData()).toHaveProperty("name", "Renamed");
});

it("allows respondent results false while the capability is active", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ approved: false, sendResultsToRespondent: true });
  await PATCH(
    patchReq({ sendResultsToRespondent: false }) as never,
    detailParams("c1"),
  );
  expect(updateData()).toHaveProperty("sendResultsToRespondent", false);
});

it("persists coach notification only while its own flag is active", async () => {
  process.env.WAVE_D_COACH_NOTIFY_ENABLED = "1";
  mockCampaign({ notifyCoachOnCompletion: false });
  await PATCH(
    patchReq({ notifyCoachOnCompletion: true }) as never,
    detailParams("c1"),
  );
  expect(updateData()).toHaveProperty("notifyCoachOnCompletion", true);
});

it("drops both notification fields with flags off while applying other fields", async () => {
  mockCampaign();
  const res = await PATCH(
    patchReq({
      name: "Renamed",
      sendResultsToRespondent: true,
      notifyCoachOnCompletion: true,
    }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(200);
  expect(updateData()).not.toHaveProperty("sendResultsToRespondent");
  expect(updateData()).not.toHaveProperty("notifyCoachOnCompletion");
  expect(updateData()).toHaveProperty("name", "Renamed");
});

it("persists notification fields on a DRAFT campaign", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  process.env.WAVE_D_COACH_NOTIFY_ENABLED = "1";
  mockCampaign({ status: "DRAFT", approved: true });
  const res = await PATCH(
    patchReq({ sendResultsToRespondent: true, notifyCoachOnCompletion: true }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(200);
  expect(updateData()).toMatchObject({
    sendResultsToRespondent: true,
    notifyCoachOnCompletion: true,
  });
});

it("returns 409 for a CLOSED campaign without writing notification fields", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  mockCampaign({ status: "CLOSED", approved: true });
  const res = await PATCH(
    patchReq({ sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(409);
  expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
});

it("returns 404 for a non-owner without writing notification fields", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
  mockCampaign({ approved: true, createdByCoachId: "coach-1" });
  const res = await PATCH(
    patchReq({ sendResultsToRespondent: true }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(404);
  expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
});

it("audits both authorized notification fields through the existing changes payload", async () => {
  process.env.WAVE_D_RESULTS_EMAIL_ENABLED = "1";
  process.env.WAVE_D_COACH_NOTIFY_ENABLED = "1";
  mockCampaign({ approved: true });
  await PATCH(
    patchReq({ sendResultsToRespondent: true, notifyCoachOnCompletion: true }) as never,
    detailParams("c1"),
  );
  expect(logAudit).toHaveBeenCalledTimes(1);
  expect((logAudit as jest.Mock).mock.calls[0][0].changes).toMatchObject({
    sendResultsToRespondent: true,
    notifyCoachOnCompletion: true,
  });
});

it.each([
  ["sendResultsToRespondent", "true"],
  ["notifyCoachOnCompletion", 1],
])("returns 400 when %s is not a boolean", async (field, value) => {
  mockCampaign();
  const res = await PATCH(
    patchReq({ [field]: value }) as never,
    detailParams("c1"),
  );
  expect(res.status).toBe(400);
  expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
});
