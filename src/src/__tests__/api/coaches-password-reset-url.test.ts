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
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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

jest.mock("@/lib/auth/coach-password-actions-flags", () => ({
  isCoachPasswordActionsEnabled: jest.fn(),
}));

jest.mock("@/services/notifications", () => ({
  sendCoachWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendCoachPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST as createCoachPOST } from "@/app/api/coaches/route";
import { POST as sendResetPOST } from "@/app/api/coaches/[id]/send-password-reset/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";
import {
  sendCoachPasswordResetEmail,
  sendCoachWelcomeEmail,
} from "@/services/notifications";

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
  (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(false);
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
        title: "Master Coach",
        company: "A Step Above",
      });

      await createCoachPOST(asNextRequest<typeof createCoachPOST>(req));

      expect(sendCoachWelcomeEmail).toHaveBeenCalledTimes(1);
      const call = (sendCoachWelcomeEmail as jest.Mock).mock.calls[0][0];
      expect(call.passwordSetUrl).toMatch(/\/reset-password\?token=token-abc-123&email=newcoach%40example\.com$/);
      expect(call.passwordSetUrl).not.toMatch(/\/auth\/reset-password/);
      expect(db.coach.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          title: "Master Coach",
          company: "A Step Above",
        }),
      }));
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

    it("feature-on sends a dedicated reset email with a 15-minute token", async () => {
      (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(true);
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "staff-1",
        email: "staff@example.com",
        role: "STAFF",
      });
      (db.coach.findUnique as jest.Mock).mockResolvedValue({
        id: "coach-1",
        email: "existing@example.com",
        firstName: "Existing",
        lastName: "Coach",
        user: {
          id: "user-1",
          role: "COACH",
          deletedAt: null,
          passwordHash: "$2a$12$hash",
        },
      });
      (generatePasswordResetToken as jest.Mock).mockReturnValue("token-15m");

      await sendResetPOST(
        buildRequest("http://localhost/api/coaches/coach-1/send-password-reset", {}),
        { params: Promise.resolve({ id: "coach-1" }) },
      );

      expect(generatePasswordResetToken).toHaveBeenCalledWith(
        "existing@example.com",
        "$2a$12$hash",
        15 * 60,
      );
      expect(sendCoachPasswordResetEmail).toHaveBeenCalledWith({
        coachEmail: "existing@example.com",
        coachName: "Existing Coach",
        resetUrl: expect.stringContaining("/reset-password?token=token-15m"),
        expiresInMinutes: 15,
      });
      expect(sendCoachWelcomeEmail).not.toHaveBeenCalled();
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it("feature-on refuses a missing, deleted, or privileged linked user", async () => {
      (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(true);
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
      });

      for (const user of [
        null,
        { id: "user-1", role: "COACH", deletedAt: new Date(), passwordHash: "hash" },
        { id: "user-1", role: "ADMIN", deletedAt: null, passwordHash: "hash" },
      ]) {
        (db.coach.findUnique as jest.Mock).mockResolvedValueOnce({
          id: "coach-1",
          email: "existing@example.com",
          firstName: "Existing",
          lastName: "Coach",
          user,
        });
        const response = await sendResetPOST(
          buildRequest("http://localhost/api/coaches/coach-1/send-password-reset", {}),
          { params: Promise.resolve({ id: "coach-1" }) },
        );
        expect(response.status).toBe(409);
      }
      expect(generatePasswordResetToken).not.toHaveBeenCalled();
    });
  });
});
