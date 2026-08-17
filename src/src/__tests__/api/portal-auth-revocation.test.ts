jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
  },
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { id: "user-1", email: "coach@example.com", role: "COACH" },
  }),
}));

jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn().mockResolvedValue(null),
}));

jest.mock("@vercel/blob", () => ({ put: jest.fn() }));

jest.mock("@/lib/db", () => ({
  db: {
    coach: { findUnique: jest.fn() },
    workshop: { findMany: jest.fn(), findFirst: jest.fn() },
    followUpReport: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { PATCH as updateProfile } from "@/app/api/portal/profile/route";
import { POST as uploadProfileImage } from "@/app/api/portal/profile/image/route";
import {
  GET as getFollowUp,
  POST as submitFollowUp,
} from "@/app/api/portal/follow-up/route";

const jsonRequest = (body: unknown) =>
  ({ json: async () => body }) as unknown as Parameters<typeof updateProfile>[0];

const formRequest = () =>
  ({ formData: async () => new FormData() }) as unknown as Parameters<
    typeof uploadProfileImage
  >[0];

describe("portal API credential-session revocation", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["PATCH profile", () => updateProfile(jsonRequest({ bio: "Updated" }))],
    ["POST profile image", () => uploadProfileImage(formRequest())],
    ["GET follow-up", () => getFollowUp()],
    ["POST follow-up", () => submitFollowUp(jsonRequest({ workshopId: "w-1" }))],
  ])("returns 401 before data access for %s", async (_name, invoke) => {
    const response = await invoke();

    expect(response.status).toBe(401);
    expect(getApiActor).toHaveBeenCalled();
    expect(db.coach.findUnique).not.toHaveBeenCalled();
  });
});
