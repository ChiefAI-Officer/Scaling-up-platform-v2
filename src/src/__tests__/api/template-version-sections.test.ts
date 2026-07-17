/**
 * Wave ED8 (spec 19ak §4 + C4, Task T3) — GET
 * /api/assessment-templates/[id]/version-sections.
 *
 * The route resolves the ACTIVE version through the shared
 * `resolveActiveVersion` helper, which guarantees where + ordering + language
 * parity with campaign-create BY CONSTRUCTION:
 *   - C4: the route previously defaulted the language to "en" while
 *     campaign-create used "enUS" — against real data ("enUS" on every seeded
 *     published row) "en" resolved an EMPTY row set, breaking the wizard's
 *     expectedVersionId hand-off. Now both sides use
 *     DEFAULT_TEMPLATE_LANGUAGE.
 *   - ED8: the where carries archivedAt: null (persisted admin intent —
 *     never flag-gated), so an all-archived template 404s.
 *
 * Harness mirrors admin-template-benchmarks.test.ts (mocked next/server, db,
 * authorization, access-control).
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
    assessmentTemplateVersion: { findFirst: jest.fn(), findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessTemplate: jest.fn().mockResolvedValue(true),
  asAccessDb: (x: unknown) => x,
}));

import { GET } from "@/app/api/assessment-templates/[id]/version-sections/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { canAccessTemplate } from "@/lib/assessments/access-control";

const coachActor = {
  userId: "u2",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-1",
};

const routeParams = { params: Promise.resolve({ id: "tpl-1" }) };

function getReq(): Request {
  return new Request(
    "http://localhost/api/assessment-templates/tpl-1/version-sections",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue(coachActor);
  (canAccessTemplate as jest.Mock).mockResolvedValue(true);
  (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue({
    id: "ver-1",
    language: "enUS",
    versionNumber: 2,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    archivedAt: null,
  });
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
    sections: [
      { stableKey: "s2", name: "Section Two", sortOrder: 2 },
      { stableKey: "s1", name: "Section One", sortOrder: 1 },
    ],
  });
});

describe("GET /api/assessment-templates/[id]/version-sections", () => {
  it("401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(getReq() as never, routeParams);
    expect(res.status).toBe(401);
  });

  it("404 (opaque) when the actor cannot access the template", async () => {
    (canAccessTemplate as jest.Mock).mockResolvedValue(false);
    const res = await GET(getReq() as never, routeParams);
    expect(res.status).toBe(404);
    expect(db.assessmentTemplateVersion.findFirst).not.toHaveBeenCalled();
  });

  it("resolves via the shared Active where — enUS default language (C4) + archived-exclusion (ED8)", async () => {
    await GET(getReq() as never, routeParams);

    expect(db.assessmentTemplateVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          templateId: "tpl-1",
          language: "enUS", // C4 — NOT "en"; must match campaign-create
          publishedAt: { not: null },
          archivedAt: null, // ED8 — persisted admin intent, not flag-gated
        },
        orderBy: { versionNumber: "desc" },
      }),
    );
  });

  it("200 happy path: sections fetched by the resolved Active id, projected + sorted", async () => {
    const res = await GET(getReq() as never, routeParams);
    expect(res.status).toBe(200);

    expect(db.assessmentTemplateVersion.findUnique).toHaveBeenCalledWith({
      where: { id: "ver-1" },
      select: { sections: true },
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.versionId).toBe("ver-1");
    expect(body.data.sections).toEqual([
      { stableKey: "s1", name: "Section One" },
      { stableKey: "s2", name: "Section Two" },
    ]);
  });

  it("404 with unchanged copy when no Active version exists (e.g. all archived)", async () => {
    (db.assessmentTemplateVersion.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    const res = await GET(getReq() as never, routeParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No published version for this template");
    expect(db.assessmentTemplateVersion.findUnique).not.toHaveBeenCalled();
  });
});
