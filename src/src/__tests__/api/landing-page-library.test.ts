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

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/template-interpolation", () => ({
  rewriteIdentityFields: jest.fn((content: string) => content),
  buildWorkshopVariables: jest.fn().mockResolvedValue(null),
}));

import { GET } from "@/app/api/landing-pages/library/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

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
