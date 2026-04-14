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

import { GET, PATCH } from "@/app/api/coaches/[id]/route";
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
  certifications: [],
  workshops: [],
};

describe("Coach bookCallUrl API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
  });

  describe("PATCH /api/coaches/[id] — bookCallUrl field", () => {
    it("saves a valid https bookCallUrl", async () => {
      (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);
      const updatedCoach = { ...mockCoach, bookCallUrl: "https://cal.com/test" };
      (db.coach.update as jest.Mock).mockResolvedValue(updatedCoach);

      const req = new Request("http://localhost/api/coaches/coach-1", {
        method: "PATCH",
        body: JSON.stringify({ bookCallUrl: "https://cal.com/test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.coach.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookCallUrl: "https://cal.com/test" }),
        })
      );
    });

    it("saves a valid http bookCallUrl", async () => {
      (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);
      const updatedCoach = { ...mockCoach, bookCallUrl: "http://example.com/book" };
      (db.coach.update as jest.Mock).mockResolvedValue(updatedCoach);

      const req = new Request("http://localhost/api/coaches/coach-1", {
        method: "PATCH",
        body: JSON.stringify({ bookCallUrl: "http://example.com/book" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("rejects a javascript: bookCallUrl with 400", async () => {
      (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCoach);

      const req = new Request("http://localhost/api/coaches/coach-1", {
        method: "PATCH",
        body: JSON.stringify({ bookCallUrl: "javascript:alert(1)" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it("clears bookCallUrl when set to null", async () => {
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        ...mockCoach,
        bookCallUrl: "https://cal.com/test",
      });
      const updatedCoach = { ...mockCoach, bookCallUrl: null };
      (db.coach.update as jest.Mock).mockResolvedValue(updatedCoach);

      const req = new Request("http://localhost/api/coaches/coach-1", {
        method: "PATCH",
        body: JSON.stringify({ bookCallUrl: null }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await PATCH(req as Parameters<typeof PATCH>[0], routeParams());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.coach.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bookCallUrl: null }),
        })
      );
    });
  });

  describe("GET /api/coaches/[id] — returns bookCallUrl", () => {
    it("returns bookCallUrl in the response data", async () => {
      const coachWithUrl = {
        ...mockCoach,
        bookCallUrl: "https://calendly.com/jane",
      };
      (db.coach.findUnique as jest.Mock).mockResolvedValue(coachWithUrl);

      const req = new Request("http://localhost/api/coaches/coach-1");
      const res = await GET(req as Parameters<typeof GET>[0], routeParams());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.bookCallUrl).toBe("https://calendly.com/jane");
    });
  });
});
