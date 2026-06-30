/**
 * Wave M (#19) — custom slides on PATCH /api/assessment-campaigns/[id].
 *
 * Covers:
 *   - R1-High-1 flag-gate: flag OFF ⇒ `customSlides` IGNORED (not in update).
 *   - R1-Med-5 required CAS: missing `expectedCustomSlides` ⇒ 400; stale
 *     sentinel ⇒ 409.
 *   - lifecycle: CLOSED ⇒ 409; ACTIVE ⇒ 200 (slides editable on ACTIVE).
 *   - authz: non-owner coach ⇒ 404.
 *   - R2-High-1 anchor-validate against the campaign's pinned version ⇒ 400.
 *   - caps + sanitize-on-save.
 *   - R2-Med-1 atomicity: the slide update + tx.auditLog.create run in ONE tx.
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

import { PATCH } from "@/app/api/assessment-campaigns/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

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

const SLIDE_FLAG = "WAVE_M_CUSTOM_SLIDES_ENABLED";
const ORIGINAL_FLAG = process.env[SLIDE_FLAG];

function startSlide(overrides: Record<string, unknown> = {}) {
  return {
    id: "slide00000001",
    title: "Welcome",
    html: "<p>Hello</p>",
    position: { kind: "start" },
    sortOrder: 0,
    ...overrides,
  };
}

/** Mock the campaign-load (canManageCampaign findFirst + the route's findUnique). */
function mockCampaign(opts: {
  status?: "DRAFT" | "ACTIVE" | "CLOSED";
  customSlides?: unknown;
  createdByCoachId?: string;
}) {
  const row = {
    id: "c1",
    organizationId: "org-1",
    templateId: "tpl-1",
    createdByCoachId: opts.createdByCoachId ?? "coach-1",
    status: opts.status ?? "DRAFT",
    versionId: "ver-1",
    customSlides: opts.customSlides ?? null,
  };
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(row);
  return row;
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
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    sections: [
      { stableKey: "sec_cash", name: "Cash", sortOrder: 0 },
      { stableKey: "sec_people", name: "People", sortOrder: 1 },
    ],
  });
  (db.assessmentCampaign.update as jest.Mock).mockResolvedValue({
    id: "c1",
    customSlides: [],
  });
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env[SLIDE_FLAG];
  else process.env[SLIDE_FLAG] = ORIGINAL_FLAG;
});

describe("PATCH customSlides — flag OFF", () => {
  beforeEach(() => {
    delete process.env[SLIDE_FLAG];
  });

  it("ignores customSlides (not written) and leaves other behavior intact", async () => {
    mockCampaign({ status: "DRAFT" });
    const res = await PATCH(
      patchReq({ name: "Renamed", customSlides: [startSlide()] }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    const updateArg = (db.assessmentCampaign.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("customSlides");
    expect(updateArg.data.name).toBe("Renamed");
    // No version-section load, no tx (legacy single-update path).
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("PATCH customSlides — flag ON", () => {
  beforeEach(() => {
    process.env[SLIDE_FLAG] = "1";
  });

  it("400 when expectedCustomSlides sentinel is missing", async () => {
    mockCampaign({ status: "DRAFT", customSlides: null });
    const res = await PATCH(
      patchReq({ customSlides: [startSlide()] }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/expectedCustomSlides is required/i);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("409 when expectedCustomSlides is stale (≠ stored)", async () => {
    // Stored is a one-slide array; the editor's sentinel says it was empty.
    mockCampaign({ status: "DRAFT", customSlides: [startSlide()] });
    const res = await PATCH(
      patchReq({ customSlides: [startSlide({ id: "slide00000002" })], expectedCustomSlides: [] }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
    expect(db.assessmentCampaign.update).not.toHaveBeenCalled();
  });

  it("409 on a CLOSED campaign (slides read-only)", async () => {
    mockCampaign({ status: "CLOSED" });
    const res = await PATCH(
      patchReq({ customSlides: [startSlide()], expectedCustomSlides: null }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(409);
  });

  it("404 for a non-owner coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(otherCoachActor);
    mockCampaign({ status: "DRAFT", createdByCoachId: "coach-1" });
    const res = await PATCH(
      patchReq({ customSlides: [startSlide()], expectedCustomSlides: null }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("400 on unknown before-section anchor", async () => {
    mockCampaign({ status: "DRAFT", customSlides: null });
    const res = await PATCH(
      patchReq({
        customSlides: [
          startSlide({ position: { kind: "before-section", sectionStableKey: "sec_unknown" } }),
        ],
        expectedCustomSlides: null,
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/unknown section anchor/i);
  });

  it("400 over the slide-count cap", async () => {
    mockCampaign({ status: "DRAFT", customSlides: null });
    const eleven = Array.from({ length: 11 }, (_, i) =>
      startSlide({ id: `slide0000000${i}a`, sortOrder: i }),
    );
    const res = await PATCH(
      patchReq({ customSlides: eleven, expectedCustomSlides: null }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(400);
  });

  it("200 on ACTIVE: persists sanitized slides + audit IN the same tx", async () => {
    mockCampaign({ status: "ACTIVE", customSlides: null });
    const res = await PATCH(
      patchReq({
        customSlides: [startSlide({ html: '<p>Hi</p><script>x()</script>' })],
        expectedCustomSlides: null,
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
    // Slide write went through tx.assessmentCampaign.update with sanitized html.
    const updateArg = (db.assessmentCampaign.update as jest.Mock).mock.calls.at(-1)![0];
    const stored = updateArg.data.customSlides as Array<{ html: string }>;
    expect(stored[0].html).toContain("<p>Hi</p>");
    expect(stored[0].html).not.toMatch(/<script/i);
    // Audit written via tx.auditLog.create (atomic, not the swallowing logAudit).
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArg.data.action).toBe("UPDATE");
    const changes = JSON.parse(auditArg.data.changes);
    expect(changes.customSlides.slideCount).toBe(1);
  });

  it("CAS matches when stored equals sentinel ⇒ 200", async () => {
    const stored = [startSlide()];
    mockCampaign({ status: "DRAFT", customSlides: stored });
    const res = await PATCH(
      patchReq({
        customSlides: [startSlide({ title: "Updated" })],
        // Deep-equal to the stored value.
        expectedCustomSlides: [startSlide()],
      }) as never,
      detailParams("c1"),
    );
    expect(res.status).toBe(200);
  });
});
