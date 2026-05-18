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
    workshopType: {
      findUnique: jest.fn(),
    },
    coachCertification: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

import { POST } from "@/app/api/coaches/[id]/certifications/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

function routeParams(id = "coach-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/coaches/coach-1/certifications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as Parameters<typeof POST>[0];
}

const certPayload = { workshopTypeId: "wt-1" };

const createdCert = {
  id: "cert-1",
  coachId: "coach-1",
  workshopTypeId: "wt-1",
  status: "ACTIVE",
  workshopType: { id: "wt-1", name: "AI Workshop" },
};

describe("POST /api/coaches/[id]/certifications — auto-promote PENDING → ACTIVE", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.workshopType.findUnique as jest.Mock).mockResolvedValue({ id: "wt-1" });
    (db.coachCertification.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it("promotes a PENDING coach to ACTIVE atomically when granting a cert", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.$transaction as jest.Mock).mockResolvedValue([createdCert, { id: "coach-1" }]);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: "cert-1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.coach.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "coach-1" },
        data: { certificationStatus: "ACTIVE" },
      })
    );
  });

  it("does NOT change status when the coach is already ACTIVE", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "ACTIVE",
    });
    (db.coachCertification.create as jest.Mock).mockResolvedValue(createdCert);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(db.coach.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("does NOT promote a DEACTIVATED coach (explicit reactivation required)", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "DEACTIVATED",
    });
    (db.coachCertification.create as jest.Mock).mockResolvedValue(createdCert);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(db.coach.update).not.toHaveBeenCalled();
  });

  it("returns 409 on duplicate cert without touching coach status", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      certificationStatus: "PENDING",
    });
    (db.coachCertification.findUnique as jest.Mock).mockResolvedValue({ id: "cert-existing" });

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(db.coach.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.coachCertification.create).not.toHaveBeenCalled();
  });

  it("returns 404 when coach does not exist", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await POST(buildRequest(certPayload), routeParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(db.coach.update).not.toHaveBeenCalled();
  });
});
