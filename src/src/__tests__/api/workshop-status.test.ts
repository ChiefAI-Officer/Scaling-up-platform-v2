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
    workshop: { findUnique: jest.fn(), update: jest.fn() },
    automationTask: { create: jest.fn() },
    registration: { findMany: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/surveys/survey-automation", () => ({
  createPostWorkshopSurveys: jest.fn().mockResolvedValue({
    created: 0,
    skipped: 0,
    surveyUrls: [],
  }),
  sendSurveyEmail: jest.fn().mockResolvedValue(undefined),
}));

import { PATCH } from "@/app/api/workshops/[id]/status/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";
import {
  createPostWorkshopSurveys,
  sendSurveyEmail,
} from "@/lib/surveys/survey-automation";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function routeParams(id = "ws-1") {
  return { params: Promise.resolve({ id }) };
}

function buildPatchRequest(body: Record<string, unknown>): Parameters<typeof PATCH>[0] {
  return new Request("http://localhost/api/workshops/ws-1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

/** Convenience: mock a workshop with a given status */
function mockWorkshop(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    title: "Growth Workshop",
    status,
    ...overrides,
  };
}

/** Convenience: mock the update call to return the updated workshop */
function mockUpdateReturns(status: string) {
  (db.workshop.update as jest.Mock).mockResolvedValue({
    id: "ws-1",
    title: "Growth Workshop",
    status,
    coach: { id: "coach-1" },
    workshopType: { id: "wt-1" },
  });
}

/** Flush microtask queue so fire-and-forget .then() chains execute */
function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("Workshop status API – PATCH /api/workshops/[id]/status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated admin
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    // Default: automationTask create succeeds
    (db.automationTask.create as jest.Mock).mockResolvedValue({ id: "at-1" });
  });

  /* ---------- Auth / Authz ---------------------------------------- */

  it("returns 401 when not authenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ status: "AWAITING_APPROVAL" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/authentication required/i);
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a privileged role", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });

    const response = await PATCH(
      buildPatchRequest({ status: "AWAITING_APPROVAL" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/forbidden/i);
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  /* ---------- Validation ------------------------------------------ */

  it("returns 400 for an invalid status value (Zod validation)", async () => {
    const response = await PATCH(
      buildPatchRequest({ status: "INVALID_STATUS" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid status/i);
    expect(db.workshop.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when workshop is not found", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(
      buildPatchRequest({ status: "AWAITING_APPROVAL" }),
      routeParams("ws-missing")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/workshop not found/i);
  });

  /* ---------- Happy-path transitions ------------------------------ */

  it("REQUESTED -> AWAITING_APPROVAL is blocked (only via approval queue)", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("INFO_REQUESTED")
    );

    const response = await PATCH(
      buildPatchRequest({ status: "AWAITING_APPROVAL" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot transition/i);
  });

  it("AWAITING_APPROVAL -> PRE_EVENT succeeds", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("AWAITING_APPROVAL")
    );
    mockUpdateReturns("PRE_EVENT");

    const response = await PATCH(
      buildPatchRequest({ status: "PRE_EVENT" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("PRE_EVENT");
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        data: { status: "PRE_EVENT" },
      })
    );
  });

  it("PRE_EVENT -> POST_EVENT succeeds", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("PRE_EVENT")
    );
    mockUpdateReturns("POST_EVENT");

    const response = await PATCH(
      buildPatchRequest({ status: "POST_EVENT" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("POST_EVENT");
  });

  it("POST_EVENT -> COMPLETED succeeds and emits Inngest event", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("POST_EVENT")
    );
    mockUpdateReturns("COMPLETED");

    const response = await PATCH(
      buildPatchRequest({ status: "COMPLETED" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("COMPLETED");
    expect(inngest.send).toHaveBeenCalledWith({
      name: "workshop/completed",
      data: { workshopId: "ws-1" },
    });
  });

  /* ---------- Invalid transitions --------------------------------- */

  it("rejects REQUESTED -> COMPLETED (invalid transition)", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("INFO_REQUESTED")
    );

    const response = await PATCH(
      buildPatchRequest({ status: "COMPLETED" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot transition/i);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("rejects COMPLETED -> PRE_EVENT (invalid transition)", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("COMPLETED")
    );

    const response = await PATCH(
      buildPatchRequest({ status: "PRE_EVENT" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot transition/i);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  it("rejects POST_EVENT -> CANCELED (not in valid transitions)", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("POST_EVENT")
    );

    const response = await PATCH(
      buildPatchRequest({ status: "CANCELED" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/cannot transition.*POST_EVENT.*CANCELED/i);
    expect(db.workshop.update).not.toHaveBeenCalled();
  });

  /* ---------- Re-enable / cancel paths ---------------------------- */

  it("CANCELED -> REQUESTED re-enables a canceled workshop", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("CANCELED")
    );
    mockUpdateReturns("INFO_REQUESTED");

    const response = await PATCH(
      buildPatchRequest({ status: "INFO_REQUESTED" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("INFO_REQUESTED");
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        data: { status: "INFO_REQUESTED" },
      })
    );
  });

  it("PRE_EVENT -> CANCELED cancels a pre-event workshop", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("PRE_EVENT")
    );
    mockUpdateReturns("CANCELED");

    const response = await PATCH(
      buildPatchRequest({ status: "CANCELED" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("CANCELED");
    expect(db.workshop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        data: { status: "CANCELED" },
      })
    );
    // Inngest should NOT be called for CANCELED
    expect(inngest.send).not.toHaveBeenCalled();
  });

  /* ---------- Side-effects ---------------------------------------- */

  it("POST_EVENT transition triggers post-workshop survey creation", async () => {
    (createPostWorkshopSurveys as jest.Mock).mockResolvedValue({
      created: 2,
      skipped: 0,
      surveyUrls: [
        { email: "a@example.com", surveyUrl: "https://survey/a" },
        { email: "b@example.com", surveyUrl: "https://survey/b" },
      ],
    });
    (db.registration.findMany as jest.Mock).mockResolvedValue([
      { email: "a@example.com", firstName: "Alice", lastName: "A" },
      { email: "b@example.com", firstName: "Bob", lastName: "B" },
    ]);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("PRE_EVENT")
    );
    mockUpdateReturns("POST_EVENT");

    const response = await PATCH(
      buildPatchRequest({ status: "POST_EVENT" }),
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // Wait for the fire-and-forget .then() chain to complete
    await flushPromises();

    expect(createPostWorkshopSurveys).toHaveBeenCalledWith("ws-1");
    expect(db.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workshopId: "ws-1", status: { in: ["REGISTERED", "CONFIRMED"] } },
      })
    );
    expect(sendSurveyEmail).toHaveBeenCalledTimes(2);
    expect(sendSurveyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@example.com",
        registrantName: "Alice A",
        workshopTitle: "Growth Workshop",
        surveyUrl: "https://survey/a",
        surveyType: "POST_WORKSHOP",
      })
    );
    expect(sendSurveyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "b@example.com",
        registrantName: "Bob B",
        workshopTitle: "Growth Workshop",
        surveyUrl: "https://survey/b",
        surveyType: "POST_WORKSHOP",
      })
    );
  });

  it("does not emit Inngest event for non-COMPLETED transitions", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("PRE_EVENT")
    );
    mockUpdateReturns("POST_EVENT");

    await PATCH(
      buildPatchRequest({ status: "POST_EVENT" }),
      routeParams()
    );

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("does not trigger survey creation for non-POST_EVENT transitions", async () => {
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(
      mockWorkshop("POST_EVENT")
    );
    mockUpdateReturns("COMPLETED");

    await PATCH(
      buildPatchRequest({ status: "COMPLETED" }),
      routeParams()
    );

    await flushPromises();

    expect(createPostWorkshopSurveys).not.toHaveBeenCalled();
  });
});
