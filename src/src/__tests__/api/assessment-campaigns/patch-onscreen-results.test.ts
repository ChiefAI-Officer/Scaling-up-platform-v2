/**
 * Wave OSR (#71) — `showResultsOnScreen` on PATCH /api/assessment-campaigns/[id].
 *
 * WHY this exists: `updateAssessmentCampaignSchema` carried none of the campaign
 * toggles, so the column was writable only at CREATE and a campaign that already
 * existed could never opt in. This route is the reachability fix.
 *
 * Contract (each choice follows this route's own precedent, not a new invention):
 *   - Flag OFF ⇒ the field is IGNORED, never written — the same shape as
 *     `invitationBodyHtml` (Task 12) and `customSlides` (Wave M R1-High-1). This is
 *     consistency, NOT a security boundary: CREATE writes the same column with no
 *     flag check, and disclosure is decided under the submission lock.
 *   - `_KILL` ⇒ treated as OFF (the flag helper hard-overrides).
 *   - Flag ON ⇒ persisted in BOTH directions, and audited. Auditing needs no new
 *     code: the legacy single-update path already logs `changes: updateData`, so
 *     the assertion here pins that the toggle actually rides along in it.
 *   - No CAS sentinel: unlike slides (authored HTML a clobber would destroy), a
 *     boolean has nothing to lose to last-write-wins. Not asserted — the route only
 *     enters the slides transaction when `customSlides` is present, so any such
 *     assertion would be tautological for this branch.
 *   - CLOSED ⇒ 409 and non-owner ⇒ 404 are inherited guards; asserted so a future
 *     edit to the toggle branch cannot quietly bypass them.
 *
 * The "not written" assertions carry positive controls (an accompanying field IS
 * applied), so they cannot pass merely because the route errored out. The 409/404
 * cases are the exception: their control is the sibling 200 case in this file.
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
    // SEC-M6: canManageCampaign loads via findFirst → delegate to findUnique.
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
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

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

const OSR_FLAG = "WAVE_OSR_RESPONDENT_RESULTS_ENABLED";
const OSR_KILL = "WAVE_OSR_RESPONDENT_RESULTS_KILL";
const ORIGINAL_FLAG = process.env[OSR_FLAG];
const ORIGINAL_KILL = process.env[OSR_KILL];

function mockCampaign(opts: {
  status?: "DRAFT" | "ACTIVE" | "CLOSED";
  createdByCoachId?: string;
  showResultsOnScreen?: boolean;
} = {}) {
  const row = {
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: opts.createdByCoachId ?? "coach-1",
    status: opts.status ?? "ACTIVE",
    versionId: "ver-1",
    customSlides: null,
    showResultsOnScreen: opts.showResultsOnScreen ?? false,
  };
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(row);
  return row;
}

/** The `data` object the route handed to prisma. */
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
  (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({ id: "c1" });
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  delete process.env[OSR_KILL];
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env[OSR_FLAG];
  else process.env[OSR_FLAG] = ORIGINAL_FLAG;
  if (ORIGINAL_KILL === undefined) delete process.env[OSR_KILL];
  else process.env[OSR_KILL] = ORIGINAL_KILL;
});

describe("PATCH showResultsOnScreen — flag OFF", () => {
  beforeEach(() => {
    delete process.env[OSR_FLAG];
  });

  it("ignores the toggle (never written) while still applying the rest of the patch", async () => {
    mockCampaign({ status: "ACTIVE" });
    const res = await PATCH(
      patchReq({ name: "Renamed", showResultsOnScreen: true }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    // negative: the respondent-facing disclosure is NOT persisted…
    expect(updateData()).not.toHaveProperty("showResultsOnScreen");
    // …positive control: the request was genuinely processed, not rejected.
    expect(updateData().name).toBe("Renamed");
  });
});

describe("PATCH showResultsOnScreen — kill switch", () => {
  it("treats the field as ignored when _KILL is set, even with _ENABLED on", async () => {
    process.env[OSR_FLAG] = "1";
    process.env[OSR_KILL] = "1";
    mockCampaign({ status: "ACTIVE" });
    const res = await PATCH(
      patchReq({ name: "Renamed", showResultsOnScreen: true }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(updateData()).not.toHaveProperty("showResultsOnScreen");
    expect(updateData().name).toBe("Renamed");
  });
});

describe("PATCH showResultsOnScreen — flag ON", () => {
  beforeEach(() => {
    process.env[OSR_FLAG] = "1";
  });

  it("persists true on an ACTIVE campaign", async () => {
    mockCampaign({ status: "ACTIVE", showResultsOnScreen: false });
    const res = await PATCH(
      patchReq({ showResultsOnScreen: true }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(updateData().showResultsOnScreen).toBe(true);
  });

  it("persists false — an explicit opt-OUT is a write, not a skipped falsy value", async () => {
    mockCampaign({ status: "ACTIVE", showResultsOnScreen: true });
    const res = await PATCH(
      patchReq({ showResultsOnScreen: false }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(updateData()).toHaveProperty("showResultsOnScreen", false);
  });

  it("leaves the toggle untouched when the field is absent from the body", async () => {
    mockCampaign({ status: "ACTIVE", showResultsOnScreen: true });
    await PATCH(patchReq({ name: "Renamed" }) as never, detailParams("c1"));
    expect(updateData()).not.toHaveProperty("showResultsOnScreen");
    expect(updateData().name).toBe("Renamed");
  });

  it("audits the change (it rides along in the existing logAudit changes payload)", async () => {
    mockCampaign({ status: "ACTIVE" });
    await PATCH(patchReq({ showResultsOnScreen: true }) as never, detailParams("c1"));
    expect(logAudit).toHaveBeenCalledTimes(1);
    const arg = (logAudit as jest.Mock).mock.calls[0][0];
    expect(arg.entityType).toBe("AssessmentCampaign");
    expect(arg.action).toBe("UPDATE");
    expect(arg.performedBy).toBe("coach@example.com");
    expect(arg.changes).toHaveProperty("showResultsOnScreen", true);
  });

  it("409 on a CLOSED campaign — no write", async () => {
    mockCampaign({ status: "CLOSED" });
    const res = await PATCH(
      patchReq({ showResultsOnScreen: true }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("404 for a coach who does not own the campaign — no write", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    mockCampaign({ status: "ACTIVE", createdByCoachId: "coach-1" });
    const res = await PATCH(
      patchReq({ showResultsOnScreen: true }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });
});
