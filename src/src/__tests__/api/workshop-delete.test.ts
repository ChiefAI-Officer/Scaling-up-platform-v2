// src/src/__tests__/api/workshop-delete.test.ts
import { POST } from "@/app/api/workshops/[id]/delete/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";

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
    $transaction: jest.fn(),
    workshop: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

/**
 * TDD Red Phase: Tests 5-8 are intentionally failing.
 * They assert on `_count` fields (`approvals`, `workflowStepExecutions`) and
 * audit log keys (`approvalsDeleted`, `workflowExecutionsDeleted`) that do not
 * yet exist in the route. They will go green in Task 4 when the route is updated.
 * Do NOT remove or skip these tests.
 */

const mockWorkshop = {
  id: "ws-1",
  title: "Test Workshop",
  workshopCode: "WS-2026-TEST",
  status: "CANCELED",
  coachId: "coach-1",
  _count: {
    registrations: 3,
    landingPages: 2,
    surveys: 1,
    approvals: 2,
    workflowStepExecutions: 5,
  },
};

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function asPostRequest(body: object): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/workshops/ws-1/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/workshops/[id]/delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.$transaction as jest.Mock).mockImplementation(
      async (fn: (...args: unknown[]) => unknown) => fn(db)
    );
    (db.workshop.delete as jest.Mock).mockResolvedValue(mockWorkshop);
    (db.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-CANCELED/COMPLETED status", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      ...mockWorkshop,
      status: "PRE_EVENT",
    });
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("PRE_EVENT");
  });

  it("returns 400 when title confirmation does not match", async () => {
    const res = await POST(asPostRequest({ confirmTitle: "Wrong Title" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("confirmation does not match");
  });

  it("returns 404 when workshop not found", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("queries approvals count via _count", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.workshop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: expect.objectContaining({
            select: expect.objectContaining({
              approvals: true,
            }),
          }),
        }),
      })
    );
  });

  it("queries workflowStepExecutions count via _count", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.workshop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: expect.objectContaining({
            select: expect.objectContaining({
              workflowStepExecutions: true,
            }),
          }),
        }),
      })
    );
  });

  it("records approvalsDeleted in audit log", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PERMANENT_DELETE",
          changes: expect.stringContaining('"approvalsDeleted":2'),
        }),
      })
    );
  });

  it("records workflowExecutionsDeleted in audit log", async () => {
    await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PERMANENT_DELETE",
          changes: expect.stringContaining('"workflowExecutionsDeleted":5'),
        }),
      })
    );
  });

  it("returns success message on valid deletion", async () => {
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("Test Workshop");
  });

  it("returns 500 when transaction throws", async () => {
    (db.$transaction as jest.Mock).mockRejectedValue(new Error("DB connection lost"));
    const res = await POST(asPostRequest({ confirmTitle: "Test Workshop" }), routeParams());
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
