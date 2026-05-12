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
    coach: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { PATCH } from "@/app/api/coaches/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function routeParams(id = "coach-1") {
  return { params: Promise.resolve({ id }) };
}

const mockCoach = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Jane",
  lastName: "Smith",
  showBookCallCta: true,
  bookCallUrl: null,
  bio: null,
  phone: null,
  company: null,
  profileImage: null,
  linkedinUrl: null,
  hubspotId: null,
  circleId: null,
};

describe("PATCH /api/coaches/[id] — integration IDs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("admin session: persists hubspotId and returns 200", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);
    const updated = { ...mockCoach, hubspotId: "hs_123" };
    (db.coach.update as jest.Mock).mockResolvedValue(updated);

    const req = new Request("http://localhost/api/coaches/coach-1", {
      method: "PATCH",
      body: JSON.stringify({ hubspotId: "hs_123" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ hubspotId: "hs_123" }),
      })
    );
  });

  it("coach session: returns 403 when role is COACH", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const req = new Request("http://localhost/api/coaches/coach-1", {
      method: "PATCH",
      body: JSON.stringify({ hubspotId: "hs_123" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(db.coach.update).not.toHaveBeenCalled();
  });

  it("admin session + Prisma P2002 on hubspotId: returns 409", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);

    // Simulate Prisma unique constraint violation
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["hubspotId"] },
    });
    (db.coach.update as jest.Mock).mockRejectedValue(prismaError);

    const req = new Request("http://localhost/api/coaches/coach-1", {
      method: "PATCH",
      body: JSON.stringify({ hubspotId: "hs_duplicate" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      "This HubSpot/Circle ID is already assigned to another coach"
    );
  });
});
