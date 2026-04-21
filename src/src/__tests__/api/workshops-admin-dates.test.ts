/**
 * Task 10: Admin past-date workshop creation/editing
 *
 * Admins can create or edit workshops with past event dates (retroactive imports).
 * Coaches remain blocked from past dates.
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
  canManageCoachData: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    workshopType: {
      findUnique: jest.fn().mockResolvedValue({ id: "wt1", name: "Scaling Up" }),
    },
    approvalQueue: {
      create: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    coach: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    landingPage: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pricingTier: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    automationTask: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/workshops/workshop-code", () => ({
  generateUniqueWorkshopCode: jest.fn().mockResolvedValue("WS-2026-TEST"),
}));

jest.mock("@/services/notifications", () => ({
  sendWorkshopRequestedEmail: jest.fn().mockResolvedValue(undefined),
  sendCustomPriceChangeEmail: jest.fn().mockResolvedValue(undefined),
  sendWorkshopDateChangeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/stripe", () => ({
  createWorkshopPromotionCode: jest.fn(),
  chargeCancellationFee: jest.fn(),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/lib/templates/template-interpolation", () => ({
  buildWorkshopVariables: jest.fn().mockResolvedValue(null),
  interpolateContent: jest.fn(),
  rewriteIdentityFields: jest.fn(),
}));

import { POST } from "@/app/api/workshops/route";
import { PATCH } from "@/app/api/workshops/[id]/route";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

const mockCertifiedCoach = {
  id: "c1",
  firstName: "Coach",
  lastName: "Test",
  email: "coach@test.com",
  profileImage: null,
  company: null,
  linkedinUrl: null,
  certifications: [{ workshopTypeId: "wt1", status: "ACTIVE" }],
};

const mockCreatedWorkshop = {
  id: "w1",
  workshopCode: "WS-2026-TEST",
  coachId: "c1",
  status: "AWAITING_APPROVAL",
  title: "Test Workshop",
  eventDate: new Date(yesterday),
  isFree: true,
  priceCents: null,
  pricingTierId: null,
  coupons: "[]",
  coach: { email: "coach@test.com", firstName: "Coach", lastName: "Test", linkedinUrl: null },
};

function postRequest(body: Record<string, unknown>): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/workshops", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function patchRequest(body: Record<string, unknown>): Parameters<typeof PATCH>[0] {
  return new Request("http://localhost/api/workshops/w1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

function routeParams(id = "w1") {
  return { params: Promise.resolve({ id }) };
}

describe("Admin past-date workshop creation/editing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPrivilegedRole as jest.Mock).mockImplementation(
      (role: string) => role === "ADMIN" || role === "STAFF"
    );
    (db.workshop.create as jest.Mock).mockResolvedValue(mockCreatedWorkshop);
    (db.workshop.update as jest.Mock).mockResolvedValue({
      ...mockCreatedWorkshop,
      eventDate: new Date(yesterday),
    });
    (db.workshop.findUnique as jest.Mock).mockResolvedValue(null);
    (db.approvalQueue.create as jest.Mock).mockResolvedValue({});
    (db.coach.findUnique as jest.Mock).mockResolvedValue(mockCertifiedCoach);
  });

  it("admin can POST workshop with past eventDate", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      coachId: null,
      email: "admin@test.com",
    });

    const res = await POST(
      postRequest({
        title: "Test Workshop",
        eventDate: yesterday,
        eventTime: "09:00 - 17:00",
        maxAttendees: 20,
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/test",
        isFree: true,
        termsAcceptedAt: new Date().toISOString(),
        coachId: "c1",
        workshopTypeId: "wt1",
      })
    );

    expect([200, 201]).toContain(res.status);
  });

  it("admin can PATCH workshop to a past eventDate", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      coachId: null,
      email: "admin@test.com",
    });

    (db.workshop.findUnique as jest.Mock).mockResolvedValue({
      id: "w1",
      coachId: "c1",
      status: "PRE_EVENT",
      eventDate: new Date(tomorrow),
      isFree: true,
      priceCents: null,
      pricingTierId: null,
      coupons: "[]",
      workshopCode: "WS-2026-TEST",
      title: "Test Workshop",
      format: "VIRTUAL",
    });

    const res = await PATCH(patchRequest({ eventDate: yesterday }), routeParams());
    expect(res.status).toBe(200);
  });

  it("coach cannot POST workshop with past eventDate", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      role: "COACH",
      coachId: "c1",
      email: "coach@test.com",
    });

    const res = await POST(
      postRequest({
        title: "Test Workshop",
        eventDate: yesterday,
        eventTime: "09:00 - 17:00",
        maxAttendees: 20,
        format: "VIRTUAL",
        virtualLink: "https://zoom.us/test",
        isFree: true,
        termsAcceptedAt: new Date().toISOString(),
        coachId: "c1",
        workshopTypeId: "wt1",
      })
    );

    // The POST route restricts to privileged roles only (returns 403 for coaches).
    // If it ever opens to coaches, the past-date block should return 400.
    expect([400, 403]).toContain(res.status);
  });
});
