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
    landingPage: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { DELETE } from "@/app/api/landing-pages/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

function routeParams(id = "page-1") {
  return { params: Promise.resolve({ id }) };
}

function buildDeleteRequest(): Parameters<typeof DELETE>[0] {
  return new Request("http://localhost/api/landing-pages/page-1", {
    method: "DELETE",
  }) as unknown as Parameters<typeof DELETE>[0];
}

describe("DELETE /api/landing-pages/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 for non-admin users to avoid enumeration", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Landing page not found");
    expect(db.landingPage.findUnique).not.toHaveBeenCalled();
    expect(db.landingPage.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion of active template pages", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-user",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-1",
      isActiveTemplate: true,
    });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Active template pages cannot be deleted");
    expect(db.landingPage.delete).not.toHaveBeenCalled();
  });

  it("deletes non-active pages for admins", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-user",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.landingPage.findUnique as jest.Mock).mockResolvedValue({
      id: "page-1",
      isActiveTemplate: false,
    });
    (db.landingPage.delete as jest.Mock).mockResolvedValue({ id: "page-1" });

    const response = await DELETE(buildDeleteRequest(), routeParams("page-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.landingPage.delete).toHaveBeenCalledWith({
      where: { id: "page-1" },
    });
  });
});
