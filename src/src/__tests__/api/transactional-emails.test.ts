/**
 * ENH-MAY6-11: API for managing admin-editable transactional email templates.
 *
 * GET  /api/transactional-emails/[type] — read template (admin+staff only)
 * PUT  /api/transactional-emails/[type] — upsert with optimistic concurrency
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
    transactionalEmailTemplate: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { GET, PUT } from "@/app/api/transactional-emails/[type]/route";

const ctx = { params: Promise.resolve({ type: "REGISTRATION_CONFIRMATION" }) };

function buildRequest(method: "GET" | "PUT", body?: unknown): Request {
  return new Request(
    "http://localhost/api/transactional-emails/REGISTRATION_CONFIRMATION",
    {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

const adminActor = {
  userId: "u-admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};
const staffActor = {
  userId: "u-staff",
  email: "staff@example.com",
  role: "STAFF" as const,
  coachId: null,
};
const coachActor = {
  userId: "u-coach",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "c1",
};

describe("/api/transactional-emails/[type]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);
      const res = await GET(buildRequest("GET"), ctx);
      expect(res.status).toBe(401);
    });

    it("returns 403 when coach", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      const res = await GET(buildRequest("GET"), ctx);
      expect(res.status).toBe(403);
    });

    it("returns 400 when emailType is not in the allowlist", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const badCtx = { params: Promise.resolve({ type: "ARBITRARY_TYPE" }) };
      const res = await GET(buildRequest("GET"), badCtx);
      expect(res.status).toBe(400);
    });

    it("returns row when admin and row exists", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "S",
        body: "<p>B</p>",
        version: 2,
      });
      const res = await GET(buildRequest("GET"), ctx);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.subject).toBe("S");
      expect(json.data.version).toBe(2);
    });

    it("returns null data when row does not exist (admin)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await GET(buildRequest("GET"), ctx);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeNull();
    });

    it("staff is allowed (admin+staff gate)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(staffActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await GET(buildRequest("GET"), ctx);
      expect(res.status).toBe(200);
    });
  });

  describe("PUT", () => {
    it("returns 401 when unauthenticated", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(null);
      const res = await PUT(buildRequest("PUT", { subject: "X", body: "<p>X</p>" }), ctx);
      expect(res.status).toBe(401);
    });

    it("returns 403 when coach", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(coachActor);
      const res = await PUT(buildRequest("PUT", { subject: "X", body: "<p>X</p>" }), ctx);
      expect(res.status).toBe(403);
    });

    it("returns 400 when subject contains control characters (Round 2 M3)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const res = await PUT(
        buildRequest("PUT", { subject: "bad\x07subject", body: "<p>ok</p>" }),
        ctx,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when subject > 200 chars", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const res = await PUT(
        buildRequest("PUT", { subject: "x".repeat(201), body: "<p>ok</p>" }),
        ctx,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when body > 50KB", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      const big = "a".repeat(50 * 1024 + 1);
      const res = await PUT(buildRequest("PUT", { subject: "ok", body: big }), ctx);
      expect(res.status).toBe(400);
    });

    it("creates the row on first save (admin, no existing row)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      (db.transactionalEmailTemplate.upsert as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "Hi {{registrantName}}",
        body: "<p>Welcome</p>",
        version: 1,
      });

      const res = await PUT(
        buildRequest("PUT", {
          subject: "Hi {{registrantName}}",
          body: "<p>Welcome</p>",
        }),
        ctx,
      );

      expect(res.status).toBe(200);
      expect(db.transactionalEmailTemplate.upsert).toHaveBeenCalledTimes(1);
      const call = (db.transactionalEmailTemplate.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ emailType: "REGISTRATION_CONFIRMATION" });
      expect(call.create).toMatchObject({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "Hi {{registrantName}}",
        body: "<p>Welcome</p>",
        updatedBy: "u-admin",
      });
    });

    it("optimistic concurrency: 409 when version mismatch (Round 3 H1)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      // Existing row at version 5 — operator submits stale version 3.
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "S",
        body: "<p>B</p>",
        version: 5,
      });

      const res = await PUT(
        buildRequest("PUT", { subject: "NEW", body: "<p>NEW</p>", version: 3 }),
        ctx,
      );

      expect(res.status).toBe(409);
      expect(db.transactionalEmailTemplate.upsert).not.toHaveBeenCalled();
    });

    it("update increments version and stores previous on existing row", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(adminActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "OLD_SUBJECT",
        body: "<p>OLD_BODY</p>",
        version: 5,
      });
      (db.transactionalEmailTemplate.upsert as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "NEW",
        body: "<p>NEW</p>",
        version: 6,
      });

      const res = await PUT(
        buildRequest("PUT", { subject: "NEW", body: "<p>NEW</p>", version: 5 }),
        ctx,
      );

      expect(res.status).toBe(200);
      const call = (db.transactionalEmailTemplate.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update).toMatchObject({
        subject: "NEW",
        body: "<p>NEW</p>",
        version: 6,
        previousSubject: "OLD_SUBJECT",
        previousBody: "<p>OLD_BODY</p>",
      });
    });

    it("staff can PUT (admin+staff gate)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue(staffActor);
      (db.transactionalEmailTemplate.findUnique as jest.Mock).mockResolvedValue(null);
      (db.transactionalEmailTemplate.upsert as jest.Mock).mockResolvedValue({
        emailType: "REGISTRATION_CONFIRMATION",
        subject: "ok",
        body: "<p>ok</p>",
        version: 1,
      });
      const res = await PUT(buildRequest("PUT", { subject: "ok", body: "<p>ok</p>" }), ctx);
      expect(res.status).toBe(200);
    });
  });
});
