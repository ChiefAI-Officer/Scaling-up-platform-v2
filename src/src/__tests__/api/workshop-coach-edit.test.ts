/**
 * Fix 2: Workshop Coach Edit Tests (RED phase)
 *
 * Tests that coaches can PATCH description on pre-approval workshops
 * and are locked out of post-approval workshops.
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

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    approvalQueue: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendCustomPriceChangeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

import { PATCH } from "@/app/api/workshops/[id]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: Record<string, unknown>): Parameters<typeof PATCH>[0] {
  return new Request("http://localhost/api/workshops/ws-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

describe("Workshop coach edit permissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Coach actor
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-c1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
  });

  it("coach can PATCH description when workshop status is REQUESTED", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      status: "REQUESTED",
      coachId: "coach-1",
      format: "IN_PERSON",
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    (db.workshop.update as jest.Mock).mockResolvedValue({
      id: "ws-1",
      description: "Updated description",
    });

    const response = await PATCH(
      patchRequest({ description: "Updated description" }),
      routeParams("ws-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Updated description" }),
      })
    );
  });

  it("coach can PATCH description when workshop status is INFO_REQUESTED", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      status: "INFO_REQUESTED",
      coachId: "coach-1",
      format: "VIRTUAL",
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    (db.workshop.update as jest.Mock).mockResolvedValue({
      id: "ws-1",
      description: "Responding to admin feedback",
    });

    const response = await PATCH(
      patchRequest({ description: "Responding to admin feedback" }),
      routeParams("ws-1")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: "Responding to admin feedback" }),
      })
    );
  });

  it("coach CANNOT PATCH description when workshop status is PRE_EVENT", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      status: "PRE_EVENT",
      coachId: "coach-1",
      format: "IN_PERSON",
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const response = await PATCH(
      patchRequest({ description: "Trying to edit approved workshop" }),
      routeParams("ws-1")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/locked/i);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("coach CANNOT PATCH fields outside COACH_EDITABLE_FIELDS", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "ws-1",
      status: "REQUESTED",
      coachId: "coach-1",
      format: "IN_PERSON",
      eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const response = await PATCH(
      patchRequest({ maxAttendees: 100 }),
      routeParams("ws-1")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/cannot edit/i);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });
});
