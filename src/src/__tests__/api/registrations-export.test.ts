jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/db", () => ({
  db: {
    registration: {
      findMany: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/registrations/export/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

const mockReg = {
  id: "reg-1",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  company: "Acme",
  jobTitle: "CEO",
  phone: null,
  amountPaidCents: 5000,
  paymentStatus: "PAID",
  marketingOptIn: true,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  workshopId: "ws-1",
  workshop: {
    title: "Scaling Up Workshop",
    eventDate: new Date("2026-06-15T00:00:00.000Z"),
  },
};

describe("GET /api/registrations/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN" });
    (db.registration.findMany as jest.Mock).mockResolvedValue([mockReg]);
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/registrations/export"));
    expect(response.status).toBe(401);
  });

  it("returns 403 when not admin/staff", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH" });
    const response = await GET(new Request("http://localhost/api/registrations/export"));
    expect(response.status).toBe(403);
  });

  it("returns CSV for all registrations when no workshopId provided", async () => {
    const response = await GET(new Request("http://localhost/api/registrations/export"));
    expect(response.status).toBe(200);
    const callArg = (db.registration.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg.where.workshopId).toBeUndefined();
  });

  it("filters by workshopId when provided as query param", async () => {
    const response = await GET(
      new Request("http://localhost/api/registrations/export?workshopId=ws-1")
    );
    expect(response.status).toBe(200);
    expect(db.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentStatus: { not: "PENDING" },
          workshopId: "ws-1",
        }),
      })
    );
  });
});
