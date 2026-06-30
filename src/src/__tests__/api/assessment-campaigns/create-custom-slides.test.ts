/**
 * Wave M (#19) — custom slides on POST /api/assessment-campaigns (WRITE path).
 *
 * Covers the claudex-hardened create-path requirements:
 *   - R1-High-1 flag-gate: flag OFF ⇒ `customSlides` IGNORED, stored Json null.
 *   - R2-High-1 anchor-validate: unknown `before-section` anchor ⇒ 400;
 *     `expectedVersionId` mismatch ⇒ 400.
 *   - caps (custom-slides.ts): 11th slide / oversized html ⇒ 400.
 *   - sanitize-on-save: a `<script>` in a slide is stripped in the STORED value.
 *   - R3-Med-2 atomicity: the CREATE audit row is written INSIDE the create tx
 *     (tx.auditLog.create) when slides are persisted — an audit-insert failure
 *     aborts the whole create.
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
  const auditLog = { create: jest.fn().mockResolvedValue(undefined) };
  return {
    db: {
      organization: { findUnique: jest.fn() },
      coach: { findUnique: jest.fn() },
      accessGroupCoach: { findMany: jest.fn().mockResolvedValue([]) },
      accessGroupTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentTemplate: { findUnique: jest.fn() },
      assessmentTemplateVersion: { findFirst: jest.fn(), findUnique: jest.fn() },
      assessmentCampaign,
      auditLog,
      // $transaction runs the callback against a tx surface mirroring db.
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

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
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

const VALID_BODY = {
  name: "Q3",
  templateId: "tpl-1",
  organizationId: "org-1",
  openAt: "2026-06-01T10:00:00Z",
  endMode: "OPEN_END",
};

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

beforeEach(() => {
  jest.clearAllMocks();
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
  // Version sections used for anchor-validation.
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    sections: [
      { stableKey: "sec_cash", name: "Cash", sortOrder: 0 },
      { stableKey: "sec_people", name: "People", sortOrder: 1 },
    ],
  });
  (db.assessmentCampaign.create as jest.Mock).mockResolvedValue({
    id: "c1",
    alias: "acme_rockefeller_260601100000",
    status: "DRAFT",
    templateId: "tpl-1",
    versionId: "ver-1",
    organizationId: "org-1",
  });
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env[SLIDE_FLAG];
  else process.env[SLIDE_FLAG] = ORIGINAL_FLAG;
});

describe("POST customSlides — flag OFF", () => {
  beforeEach(() => {
    delete process.env[SLIDE_FLAG];
  });

  it("ignores customSlides entirely and persists Json null", async () => {
    const res = await POST(
      jsonReq({ ...VALID_BODY, customSlides: [startSlide()] }) as never,
    );
    expect(res.status).toBe(201);
    const createArg = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    // Prisma.JsonNull is the nullable-Json null sentinel — not an array.
    expect(Array.isArray(createArg.data.customSlides)).toBe(false);
    expect(createArg.data.customSlides).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "slide00000001" })]),
    );
    // No version sections loaded (anchor-validation skipped on flag-off).
    expect(db.assessmentTemplateVersion.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST customSlides — flag ON", () => {
  beforeEach(() => {
    process.env[SLIDE_FLAG] = "1";
  });

  it("400 on unknown before-section anchor", async () => {
    const res = await POST(
      jsonReq({
        ...VALID_BODY,
        customSlides: [
          startSlide({
            id: "slide00000002",
            position: { kind: "before-section", sectionStableKey: "sec_unknown" },
          }),
        ],
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/unknown section anchor/i);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("400 on expectedVersionId mismatch", async () => {
    const res = await POST(
      jsonReq({
        ...VALID_BODY,
        expectedVersionId: "ver-STALE",
        customSlides: [startSlide()],
      }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error)).toMatch(/expectedVersionId/i);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("400 over the slide-count cap (11 slides)", async () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      startSlide({ id: `slide0000000${i}a`, sortOrder: i }),
    );
    const res = await POST(
      jsonReq({ ...VALID_BODY, customSlides: eleven }) as never,
    );
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("400 over the per-slide html byte cap", async () => {
    const huge = "<p>" + "a".repeat(21000) + "</p>"; // > 20480 bytes
    const res = await POST(
      jsonReq({ ...VALID_BODY, customSlides: [startSlide({ html: huge })] }) as never,
    );
    expect(res.status).toBe(400);
    expect(db.assessmentCampaign.create).not.toHaveBeenCalled();
  });

  it("sanitizes on save: a <script> is stripped from the stored html", async () => {
    const res = await POST(
      jsonReq({
        ...VALID_BODY,
        customSlides: [
          startSlide({ html: '<p>Hi</p><script>alert(1)</script>' }),
        ],
      }) as never,
    );
    expect(res.status).toBe(201);
    const createArg = (db.assessmentCampaign.create as jest.Mock).mock.calls[0][0];
    const stored = createArg.data.customSlides as Array<{ html: string }>;
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0].html).toContain("<p>Hi</p>");
    expect(stored[0].html).not.toMatch(/<script/i);
  });

  it("valid before-section anchor persists + writes audit IN the create tx", async () => {
    const res = await POST(
      jsonReq({
        ...VALID_BODY,
        expectedVersionId: "ver-1",
        customSlides: [
          startSlide({
            id: "slide00000003",
            position: { kind: "before-section", sectionStableKey: "sec_people" },
          }),
        ],
      }) as never,
    );
    expect(res.status).toBe(201);
    // Slides persisted ⇒ the create ran inside a $transaction and the audit
    // row was written via tx.auditLog.create (NOT the post-commit logAudit).
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditArg.data.action).toBe("CREATE");
    // Audit records slide metadata (count) but NOT the raw bodies.
    const changes = JSON.parse(auditArg.data.changes);
    expect(changes.customSlides.slideCount).toBe(1);
    expect(JSON.stringify(changes)).not.toContain("Hello");
  });

  it("audit-insert failure aborts the whole create (atomicity)", async () => {
    (db.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("audit down"));
    const res = await POST(
      jsonReq({ ...VALID_BODY, customSlides: [startSlide()] }) as never,
    );
    // The tx rejects ⇒ the route's catch returns 500 (create rolled back).
    expect(res.status).toBe(500);
  });
});
