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
    },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/services/circle-sync", () => ({
  syncCoachFromCircle: jest.fn(),
}));

import { POST } from "@/app/api/coaches/[id]/circle-import/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { syncCoachFromCircle } from "@/services/circle-sync";

const warning = {
  code: "invalid-image-url",
  field: "profileImage",
  message: "Profile image skipped because Circle supplied an invalid URL.",
};

const updatedCoach = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Jane",
  lastName: "Coach",
  company: "Scaling Up Coach",
  bio: "Circle bio",
  profileImage: "https://existing.example.com/photo.jpg",
  circleId: "circle-123",
  syncedAt: new Date("2026-08-03T00:00:00.000Z"),
};

function routeParams(id = "coach-1") {
  return { params: Promise.resolve({ id }) };
}

function request() {
  return new Request("http://localhost/api/coaches/coach-1/circle-import", {
    method: "POST",
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  jest.resetAllMocks();
  (getApiActor as jest.Mock).mockResolvedValue({
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  });
  (db.coach.findUnique as jest.Mock)
    .mockResolvedValueOnce({ id: "coach-1", email: "coach@example.com" })
    .mockResolvedValueOnce(updatedCoach);
});

it("returns changed fields and nonfatal warnings with the changed-fields message", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: true,
    fieldsUpdated: ["bio", "company"],
    warnings: [warning],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.fieldsUpdated).toEqual(["bio", "company"]);
  expect(body.warnings).toEqual([warning]);
  expect(body.message).toBe("Synced 2 field(s) from Circle.");
});

it("uses warned-without-changes copy for an image-only rejection", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [warning],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.warnings).toEqual([warning]);
  expect(body.message).toBe("Sync completed; no profile fields were updated.");
  expect(body.message).not.toBe("Coach profile already up to date.");
});

it("keeps already-current copy when there are no warnings", async () => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: true,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.warnings).toEqual([]);
  expect(body.message).toBe("Coach profile already up to date.");
});

it.each([
  ["Coach not found", 404],
  ["No Circle profile found for this email", 404],
  ["Circle not configured", 503],
  ["database unavailable", 500],
])("preserves the existing %s failure mapping", async (error, status) => {
  (syncCoachFromCircle as jest.Mock).mockResolvedValue({
    success: false,
    updated: false,
    fieldsUpdated: [],
    warnings: [],
    error,
  });

  const response = await POST(request(), routeParams());
  const body = await response.json();

  expect(response.status).toBe(status);
  expect(body).toEqual({ success: false, error });
});
