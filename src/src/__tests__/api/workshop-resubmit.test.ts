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
  },
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/approval-engine", () => ({
  evaluateApproval: jest.fn(),
}));

import { POST } from "@/app/api/workshops/[id]/resubmit/route";
import { db } from "@/lib/db";
import { getApiActor, canManageCoachData } from "@/lib/authorization";
import { evaluateApproval } from "@/lib/approval-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(): Parameters<typeof POST>[0] {
  return {} as unknown as Parameters<typeof POST>[0];
}

function actorAsCoach(coachId = "coach-1") {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId,
  };
}

function actorAsAdmin() {
  return {
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  };
}

function workshopRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    title: "Scaling Up Workshop",
    status: "DENIED",
    coachId: "coach-1",
    coach: {
      id: "coach-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "coach@example.com",
    },
    workshopType: {
      id: "wt-1",
      slug: "scaling-up",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Workshop Resubmit API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resubmits DENIED workshop, status transitions to REQUESTED", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "DENIED" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: false,
      approvalId: "apr-new",
    });

    const response = await POST(buildRequest(), routeParams("ws-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.autoApproved).toBe(false);
    expect(body.approvalId).toBe("apr-new");
    expect(db.workshop.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "INFO_REQUESTED" },
    });
  });

  it("resubmits CANCELED workshop", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "CANCELED" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: false,
      approvalId: "apr-2",
    });

    const response = await POST(buildRequest(), routeParams("ws-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.workshop.update).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      data: { status: "INFO_REQUESTED" },
    });
  });

  it("returns 401 when not authenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await POST(buildRequest(), routeParams("ws-1"));

    expect(response.status).toBe(401);
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when coach does not own workshop", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach("coach-other"));
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ coachId: "coach-1" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(false);

    const response = await POST(buildRequest(), routeParams("ws-1"));

    expect(response.status).toBe(404);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("returns 404 when workshop not found", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await POST(buildRequest(), routeParams("ws-missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workshop not found");
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("returns 400 when workshop status does not allow resubmit", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "PRE_EVENT" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);

    const response = await POST(buildRequest(), routeParams("ws-1"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Cannot resubmit");
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("auto-approved: transitions directly to PRE_EVENT", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsAdmin());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "DENIED" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: true,
      approvalId: "apr-auto",
    });

    const response = await POST(buildRequest(), routeParams("ws-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.autoApproved).toBe(true);
    expect(body.message).toContain("auto-approved");
    // First call: REQUESTED, second call: PRE_EVENT
    expect(db.workshop.update).toHaveBeenCalledTimes(2);
    expect(db.workshop.update).toHaveBeenNthCalledWith(1, {
      where: { id: "ws-1" },
      data: { status: "INFO_REQUESTED" },
    });
    expect(db.workshop.update).toHaveBeenNthCalledWith(2, {
      where: { id: "ws-1" },
      data: { status: "PRE_EVENT" },
    });
  });

  it("creates new approval queue entry via evaluateApproval", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "DENIED" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (evaluateApproval as jest.Mock).mockResolvedValue({
      autoApproved: false,
      approvalId: "apr-queued",
    });

    await POST(buildRequest(), routeParams("ws-1"));

    expect(evaluateApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "WORKSHOP_REQUEST",
        coachId: "coach-1",
        coachEmail: "coach@example.com",
        workshopId: "ws-1",
        workshopTypeSlug: "scaling-up",
        requestedBy: "Jane Doe",
      })
    );
    expect(
      (evaluateApproval as jest.Mock).mock.calls[0][0].details
    ).toContain("Resubmission");
  });

  it("returns 500 when evaluateApproval throws", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(actorAsCoach());
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      workshopRecord({ status: "DENIED" })
    );
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.update as jest.Mock).mockResolvedValue({ id: "ws-1" });
    (evaluateApproval as jest.Mock).mockRejectedValue(
      new Error("Approval engine down")
    );

    const response = await POST(buildRequest(), routeParams("ws-1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to resubmit workshop");
  });
});
