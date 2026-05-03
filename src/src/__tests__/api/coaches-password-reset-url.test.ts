// BUG-01: password reset URL must point at /reset-password, NOT /auth/reset-password.
// Two routes emit this URL today and both have the wrong path:
// - POST /api/coaches (new coach invite welcome email)
// - POST /api/coaches/[id]/send-password-reset (admin-triggered reset)
// Reference page lives at /reset-password (no /auth/ prefix). The forgot-password
// route uses the correct path; this test pins both bug-fix routes to the same shape.

// ---------------------------------------------------------------------------
// Mocks — must appear BEFORE imports
// ---------------------------------------------------------------------------

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
    user: { findUnique: jest.fn(), create: jest.fn() },
    coach: { findUnique: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn(() => true),
}));

jest.mock("@/lib/auth/password-reset", () => ({
  generatePasswordResetToken: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendCoachWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST as createCoachPOST } from "@/app/api/coaches/route";
import { POST as sendResetPOST } from "@/app/api/coaches/[id]/send-password-reset/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { sendCoachWelcomeEmail } from "@/services/notifications";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asNextRequest<T extends (req: never) => unknown>(request: Request): Parameters<T>[0] {
  return request as unknown as Parameters<T>[0];
}

const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://scaling-up-platform-v2.vercel.app";
});

afterAll(() => {
  process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
});

// ---------------------------------------------------------------------------
// BUG-01 — coach invite URL shape
// ---------------------------------------------------------------------------

describe("BUG-01: password-reset URL shape (no /auth/ prefix)", () => {
  describe("POST /api/coaches (new coach invite)", () => {
    it("emits passwordSetUrl with /reset-password? (NOT /auth/reset-password)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue(null);
      (db.user.findUnique as jest.Mock).mockResolvedValue(null);
      (db.user.create as jest.Mock).mockResolvedValue({ id: "user-1", email: "newcoach@example.com" });
      (db.coach.create as jest.Mock).mockResolvedValue({ id: "coach-1" });
      (generatePasswordResetToken as jest.Mock).mockReturnValue("token-abc-123");

      const req = buildRequest("http://localhost/api/coaches", {
        email: "newcoach@example.com",
        firstName: "New",
        lastName: "Coach",
      });

      await createCoachPOST(asNextRequest<typeof createCoachPOST>(req));

      expect(sendCoachWelcomeEmail).toHaveBeenCalledTimes(1);
      const call = (sendCoachWelcomeEmail as jest.Mock).mock.calls[0][0];
      expect(call.passwordSetUrl).toMatch(/\/reset-password\?token=token-abc-123&email=newcoach%40example\.com$/);
      expect(call.passwordSetUrl).not.toMatch(/\/auth\/reset-password/);
    });
  });

  describe("POST /api/coaches/[id]/send-password-reset (admin-triggered)", () => {
    it("emits passwordSetUrl with /reset-password? (NOT /auth/reset-password)", async () => {
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        email: "existing@example.com",
        firstName: "Existing",
        lastName: "Coach",
        user: { passwordHash: "$2a$12$hash" },
      });
      (generatePasswordResetToken as jest.Mock).mockReturnValue("token-xyz-789");

      const req = buildRequest("http://localhost/api/coaches/coach-1/send-password-reset", {});
      await sendResetPOST(asNextRequest<typeof sendResetPOST>(req), {
        params: Promise.resolve({ id: "coach-1" }),
      } as unknown as Parameters<typeof sendResetPOST>[1]);

      expect(sendCoachWelcomeEmail).toHaveBeenCalledTimes(1);
      const call = (sendCoachWelcomeEmail as jest.Mock).mock.calls[0][0];
      expect(call.passwordSetUrl).toMatch(/\/reset-password\?token=token-xyz-789&email=existing%40example\.com$/);
      expect(call.passwordSetUrl).not.toMatch(/\/auth\/reset-password/);
    });
  });
});
