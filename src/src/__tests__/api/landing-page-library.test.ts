jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
  NextRequest: class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(input: string | URL, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
    }
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    landingPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    workshop: {
      findUnique: jest.fn(),
    },
    coach: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  rewriteIdentityFields: jest.fn((content: string) => content),
  buildWorkshopVariables: jest.fn().mockResolvedValue(null),
}));

import { GET, POST } from "@/app/api/landing-pages/library/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, canManageCoachData } from "@/lib/auth/authorization";

const adminActor = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

function buildRequest(url: string): Parameters<typeof GET>[0] {
  return new NextRequest(url) as unknown as Parameters<typeof GET>[0];
}

function makeLibraryPage(overrides: Record<string, unknown> = {}) {
  return {
    id: "lp-1",
    template: "SOLO_LANDING",
    status: "PUBLISHED",
    slug: "test-workshop-solo-landing-abc123",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    workshopId: "ws-1",
    isActiveTemplate: false,
    categoryId: null,
    workshop: {
      title: "Test Workshop",
      workshopCode: "TWS-001",
    },
    ...overrides,
  };
}

describe("Landing Page Library API - GET /api/landing-pages/library", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await GET(buildRequest("http://localhost/api/landing-pages/library"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for an invalid template param", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const response = await GET(
      buildRequest("http://localhost/api/landing-pages/library?template=INVALID_TEMPLATE")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid template");
  });

  it("accepts THANK_YOU as a valid template (does not reject it)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(
      buildRequest("http://localhost/api/landing-pages/library?template=THANK_YOU")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  describe("activeOnly behavior", () => {
    it("does NOT filter by isActiveTemplate when activeOnly=true (default)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([makeLibraryPage()]);

      await GET(buildRequest("http://localhost/api/landing-pages/library"));

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("isActiveTemplate");
    });

    it("does NOT filter by isActiveTemplate when activeOnly param is omitted", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);

      await GET(buildRequest("http://localhost/api/landing-pages/library?template=SOLO_LANDING"));

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("isActiveTemplate");
    });

    it("filters isActiveTemplate=false when activeOnly=false", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([makeLibraryPage()]);

      await GET(
        buildRequest("http://localhost/api/landing-pages/library?activeOnly=false")
      );

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toHaveProperty("isActiveTemplate", false);
    });

    it("returns mapped data including new fields", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([
        makeLibraryPage({ isActiveTemplate: false, categoryId: "cat-1" }),
      ]);

      const response = await GET(
        buildRequest("http://localhost/api/landing-pages/library?activeOnly=false")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data[0]).toMatchObject({
        id: "lp-1",
        isActiveTemplate: false,
        categoryId: "cat-1",
        workshopCode: "TWS-001",
        updatedAt: "2026-01-15T00:00:00.000Z",
        editPath: "/workshops/ws-1/landing-pages/solo-landing",
      });
    });
  });

  describe("categoryId filter", () => {
    it("does NOT add OR filter when activeOnly=true and categoryId provided", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);

      await GET(
        buildRequest(
          "http://localhost/api/landing-pages/library?categoryId=cat-99"
        )
      );

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("OR");
    });

    it("adds OR filter for categoryId OR null when activeOnly=false and categoryId provided", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);

      await GET(
        buildRequest(
          "http://localhost/api/landing-pages/library?activeOnly=false&categoryId=cat-42"
        )
      );

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([{ categoryId: "cat-42" }, { categoryId: null }]);
    });

    it("does NOT add OR filter when activeOnly=false but no categoryId", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([]);

      await GET(
        buildRequest("http://localhost/api/landing-pages/library?activeOnly=false")
      );

      const callArgs = (db.landingPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty("OR");
    });
  });

  describe("toTemplateEditorPath fix (THANK_YOU → thank-you)", () => {
    it("generates correct editPath for THANK_YOU template", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([
        makeLibraryPage({ template: "THANK_YOU" }),
      ]);

      const response = await GET(
        buildRequest("http://localhost/api/landing-pages/library?template=THANK_YOU")
      );

      const body = await response.json();
      expect(body.data[0].editPath).toBe("/workshops/ws-1/landing-pages/thank-you");
    });

    it("generates correct editPath for SOLO_LANDING template", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.landingPage.findMany as jest.Mock).mockResolvedValue([
        makeLibraryPage({ template: "SOLO_LANDING" }),
      ]);

      const response = await GET(
        buildRequest("http://localhost/api/landing-pages/library?template=SOLO_LANDING")
      );

      const body = await response.json();
      expect(body.data[0].editPath).toBe("/workshops/ws-1/landing-pages/solo-landing");
    });
  });

  it("returns empty data for non-privileged actors without coachId", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      role: "VIEWER",
      coachId: null,
    });

    const response = await GET(buildRequest("http://localhost/api/landing-pages/library"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// TEMPLATE-02: POST /api/landing-pages/library — customHtml clone copy-through
// ===========================================================================
describe("Landing Page Library API - POST /api/landing-pages/library (TEMPLATE-02 customHtml)", () => {
  function buildPostRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
    return new NextRequest("http://localhost/api/landing-pages/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof POST>[0];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-target",
      title: "Target Workshop",
      coachId: "coach-target",
    });
    (db.landingPage.update as jest.Mock).mockResolvedValue({});
  });

  // UPDATED (R1-HIGH-2): clone must NOT copy source customHtml — it is a resolved
  // snapshot containing source-specific values (coach name, registration URL).
  // Old behavior (copying customHtml) was removed; this test now asserts the fix.
  it("does NOT copy customHtml from source SOLO_LANDING to a SOLO_LANDING clone (R1-HIGH-2)", async () => {
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        // source page
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"x"}',
        customCode: null,
        customHtml: "<p>Cloned customHtml</p>",
        workshop: { coachId: "coach-target" },
      })
      .mockResolvedValueOnce(null); // no existing target page
    (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: "lp-new", ...args.data })
    );

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    // customHtml must NOT be copied — Prisma defaults it to null
    expect(createArgs.data.customHtml).toBeUndefined();
  });

  // UPDATED (R1-HIGH-2): clone never writes customHtml for any template type.
  // Previously asserted `toBeNull()` for ineligible templates; now the field is
  // absent from create data entirely (Prisma defaults to null).
  it("customHtml is absent from create data for ineligible THANK_YOU destination (R1-HIGH-2)", async () => {
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "lp-src",
        template: "THANK_YOU",
        content: '{"heading":"x"}',
        customCode: null,
        customHtml: "<p>Should NOT carry over</p>",
        workshop: { coachId: "coach-target" },
      })
      .mockResolvedValueOnce(null);
    (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: "lp-new", ...args.data })
    );

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "THANK_YOU",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    // customHtml is not in the data object — Prisma defaults to null
    expect(createArgs.data).not.toHaveProperty("customHtml");
  });

  // UPDATED (R1-HIGH-2): clone never writes customHtml — field is absent from create data.
  it("customHtml is absent from create data when source has customHtml=null (R1-HIGH-2)", async () => {
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"x"}',
        customCode: null,
        customHtml: null,
        workshop: { coachId: "coach-target" },
      })
      .mockResolvedValueOnce(null);
    (db.landingPage.create as jest.Mock).mockImplementation((args: any) =>
      Promise.resolve({ id: "lp-new", ...args.data })
    );

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    // customHtml is not present in the data object at all — Prisma will default to null
    expect(createArgs.data).not.toHaveProperty("customHtml");
  });
});

// ===========================================================================
// R1-HIGH-2 / R2-HIGH-1: clone route must NOT be a customHtml writer
// ===========================================================================
describe("Landing Page Library API - POST clone: customHtml isolation (R1-HIGH-2 / R2-HIGH-1)", () => {
  function buildPostRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
    return new NextRequest("http://localhost/api/landing-pages/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof POST>[0];
  }

  const coachActor = {
    userId: "coach-user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-target",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-target",
      title: "Target Workshop",
      coachId: "coach-target",
    });
    (db.landingPage.update as jest.Mock).mockResolvedValue({
      id: "lp-existing",
      workshopId: "ws-target",
      template: "SOLO_LANDING",
      status: "DRAFT",
      slug: "target-solo-landing-abc",
    });
    (db.landingPage.create as jest.Mock).mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "lp-new",
        workshopId: "ws-target",
        template: "SOLO_LANDING",
        status: "DRAFT",
        slug: "target-solo-landing-xyz",
        ...args.data,
      })
    );
  });

  // R1-HIGH-2: source customHtml is a resolved snapshot containing source-specific values.
  // Copying it leaks the SOURCE workshop's coach name / registration URL onto the target.
  it("R1-HIGH-2: create branch — does NOT copy source customHtml even for eligible SOLO_LANDING destination", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        // source page with source-specific resolved HTML
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"x"}',
        customCode: null,
        customHtml:
          "<p>Join Coach Alice for this workshop. Register at https://example.com/workshop/source-slug</p>",
        workshop: { coachId: "coach-source" },
      })
      .mockResolvedValueOnce(null); // no existing target page → create branch

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    // customHtml must NOT be present — not the source's resolved snapshot
    expect(createArgs.data).not.toHaveProperty("customHtml");
    // Confirm none of the source-specific content leaked through
    expect(JSON.stringify(createArgs.data)).not.toContain("Coach Alice");
    expect(JSON.stringify(createArgs.data)).not.toContain("source-slug");
  });

  it("R1-HIGH-2: create branch — customHtml absent from create data regardless of source value (coach actor)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"y"}',
        customCode: null,
        customHtml: "<section>Source-specific override</section>",
        workshop: { coachId: "coach-target" }, // same coach, still must not copy
      })
      .mockResolvedValueOnce(null);

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    // customHtml must NOT be present in create data at all (Prisma defaults to null)
    expect(createArgs.data).not.toHaveProperty("customHtml");
  });

  // R2-HIGH-1: if the target already has a customHtml (admin-authored override), the clone
  // update branch must not touch it — neither overwrite nor clear it.
  it("R2-HIGH-1: update branch — does NOT overwrite existing target customHtml (coach actor)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);

    const existingTargetPage = {
      id: "lp-existing",
      workshopId: "ws-target",
      template: "SOLO_LANDING",
      status: "PUBLISHED",
      slug: "target-solo-landing-abc",
      customHtml: "<div>Admin-authored override — must survive clone</div>",
    };

    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        // source page
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"z"}',
        customCode: null,
        customHtml: "<p>Source override to NOT copy</p>",
        workshop: { coachId: "coach-source" },
      })
      .mockResolvedValueOnce(existingTargetPage); // existing target → update branch

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const updateArgs = (db.landingPage.update as jest.Mock).mock.calls[0][0];
    // customHtml must NOT appear in the update data at all (neither set nor cleared)
    expect(updateArgs.data).not.toHaveProperty("customHtml");
  });

  it("R2-HIGH-1: update branch — does NOT clear target customHtml (admin actor)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);

    const existingTargetPage = {
      id: "lp-existing",
      workshopId: "ws-target",
      template: "SOLO_LANDING",
      status: "PUBLISHED",
      slug: "target-solo-landing-abc",
      customHtml: "<div>Admin override</div>",
    };

    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"a"}',
        customCode: null,
        customHtml: "<p>Should not overwrite admin override</p>",
        workshop: { coachId: "coach-source" },
      })
      .mockResolvedValueOnce(existingTargetPage);

    const response = await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    expect(response.status).toBe(200);
    const updateArgs = (db.landingPage.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data).not.toHaveProperty("customHtml");
  });

  // Confirm no UPDATE_CUSTOM_HTML audit row is written by the clone route.
  // (The route uses db.landingPage.create/update, not any audit logger — assert
  // that the db mock has no audit-related calls.)
  it("clone route does not call any audit logger for customHtml changes", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.landingPage.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: "lp-src",
        template: "SOLO_LANDING",
        content: '{"heading":"x"}',
        customCode: null,
        customHtml: "<p>Source</p>",
        workshop: { coachId: "coach-source" },
      })
      .mockResolvedValueOnce(null);

    await POST(
      buildPostRequest({
        targetWorkshopId: "ws-target",
        targetTemplate: "SOLO_LANDING",
        sourceLandingPageId: "lp-src",
      })
    );

    // The db mock has no auditLog model — if the route tried to call it, Jest
    // would throw. Confirm the create was called once and customHtml is absent.
    expect(db.landingPage.create).toHaveBeenCalledTimes(1);
    const createArgs = (db.landingPage.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data).not.toHaveProperty("customHtml");
  });
});
