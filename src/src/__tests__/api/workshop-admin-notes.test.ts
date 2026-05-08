/**
 * ENH-MAY6-2: Admin notes side table — PATCH /api/workshops/[id]/admin-notes.
 *
 * Auth boundary tests: coach must get 403 (the entire reason for the side
 * table over a Workshop column). Happy path persists via upsert.
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

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
    workshopAdminNote: {
      upsert: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { PATCH } from "@/app/api/workshops/[id]/admin-notes/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/workshops/w1/admin-notes", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "w1" }) };

describe("PATCH /api/workshops/[id]/admin-notes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ id: "w1" });
    (db.workshopAdminNote.upsert as jest.Mock).mockResolvedValue({
      id: "n1",
      workshopId: "w1",
      body: "secret admin context",
      updatedBy: "u-admin",  // userId field on ApiActor
    });
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns 403 when actor is a coach (admin-only boundary)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "u-coach",
      email: "coach@example.com",
      role: "COACH",
      coachId: "c1",
    });

    const res = await PATCH(buildRequest({ body: "secret admin context" }), ctx);
    expect(res.status).toBe(403);
    expect(db.workshopAdminNote.upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when actor is unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const res = await PATCH(buildRequest({ body: "x" }), ctx);
    expect(res.status).toBe(401);
    expect(db.workshopAdminNote.upsert).not.toHaveBeenCalled();
  });

  it("admin upserts the note (creates on first save)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "u-admin",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });

    const res = await PATCH(buildRequest({ body: "secret admin context" }), ctx);
    expect(res.status).toBe(200);
    expect(db.workshopAdminNote.upsert).toHaveBeenCalledTimes(1);
    const call = (db.workshopAdminNote.upsert as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ workshopId: "w1" });
    expect(call.create).toMatchObject({
      workshopId: "w1",
      body: "secret admin context",
      updatedBy: "u-admin",  // userId field on ApiActor
    });
    expect(call.update).toMatchObject({
      body: "secret admin context",
      updatedBy: "u-admin",  // userId field on ApiActor
    });
  });

  it("staff can save (STAFF role passes the gate)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "u-staff",
      email: "staff@example.com",
      role: "STAFF",
      coachId: null,
    });

    const res = await PATCH(buildRequest({ body: "ops note" }), ctx);
    expect(res.status).toBe(200);
    expect(db.workshopAdminNote.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when workshop does not exist", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ id: "u-admin", role: "ADMIN" });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await PATCH(buildRequest({ body: "x" }), ctx);
    expect(res.status).toBe(404);
    expect(db.workshopAdminNote.upsert).not.toHaveBeenCalled();
  });

  it("rejects body that is not a string with 400", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({ id: "u-admin", role: "ADMIN" });

    const res = await PATCH(buildRequest({ body: 123 }), ctx);
    expect(res.status).toBe(400);
    expect(db.workshopAdminNote.upsert).not.toHaveBeenCalled();
  });
});
