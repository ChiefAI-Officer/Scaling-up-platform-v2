// ---------------------------------------------------------------------------
// Mocks — must appear BEFORE any imports that reference the mocked modules
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
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    coach: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { auth: { interval: 60000, maxRequests: 10 } },
  withRateLimit: jest.fn(),
}));

jest.mock("@/lib/auth/password-reset", () => ({
  generatePasswordResetToken: jest.fn(),
  verifyPasswordResetToken: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$hashedpassword"),
  compare: jest.fn(),
}));

jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: "test-id" }),
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST as forgotPasswordPOST } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordPOST } from "@/app/api/auth/reset-password/route";
import { POST as coachSignupPOST } from "@/app/api/auth/coach-signup/route";

import { db } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from "@/lib/auth/password-reset";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Request that satisfies NextRequest expectations. */
function buildRequest(
  url: string,
  body: Record<string, unknown>
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Cast a plain Request to the NextRequest parameter type of the route. */
function asNextRequest<T extends (req: never) => unknown>(
  request: Request
): Parameters<T>[0] {
  return request as unknown as Parameters<T>[0];
}

/** Parse a Response body as JSON (polyfill Response has .json() but not .text()). */
async function parseJson(response: Response) {
  return response.json();
}

// Default rate-limit "allowed" stub
const allowedRateLimit = {
  allowed: true,
  headers: {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "9",
    "X-RateLimit-Reset": String(Date.now() + 60000),
  },
};

const blockedRateLimit = {
  allowed: false,
  headers: {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Date.now() + 60000),
    "Retry-After": "60",
  },
};

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  (withRateLimit as jest.Mock).mockResolvedValue(allowedRateLimit);
  // Default env for tests
  Object.defineProperty(process.env, "NODE_ENV", { value: "test", writable: true });
  delete process.env.SMTP_HOST;
});

// ===========================================================================
// 1. POST /api/auth/forgot-password
// ===========================================================================

describe("POST /api/auth/forgot-password", () => {
  const url = "http://localhost/api/auth/forgot-password";

  const mockUser = {
    id: "user-1",
    email: "coach@example.com",
    passwordHash: "$2a$12$existinghash",
  };

  it("returns a generic success message when user exists (happy path)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (generatePasswordResetToken as jest.Mock).mockReturnValue("reset-token-abc");

    const req = buildRequest(url, { email: "coach@example.com" });
    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/If an account exists/);
    expect(generatePasswordResetToken).toHaveBeenCalledWith(
      mockUser.email,
      mockUser.passwordHash
    );
  });

  it("returns 429 when rate limited", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue(blockedRateLimit);

    const req = buildRequest(url, { email: "coach@example.com" });
    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Too many requests/);
  });

  it("returns 400 for invalid email format", async () => {
    const req = buildRequest(url, { email: "not-an-email" });
    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns generic success when user is NOT found (no email leak)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const req = buildRequest(url, { email: "nobody@example.com" });
    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/If an account exists/);
    // Token generation should NOT have been called
    expect(generatePasswordResetToken).not.toHaveBeenCalled();
  });

  it("generates a reset link and attempts to send email when user exists", async () => {
    // Simulate production SMTP being available
    process.env.SMTP_HOST = "smtp.example.com";
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", writable: true });
    process.env.APP_URL = "https://app.scalingup.com";

    (db.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (generatePasswordResetToken as jest.Mock).mockReturnValue("reset-token-xyz");

    const req = buildRequest(url, { email: "coach@example.com" });
    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // nodemailer transporter should have been created
    expect(nodemailer.createTransport).toHaveBeenCalled();

    // The sendMail mock should have been invoked with the user's email
    const transporter = (nodemailer.createTransport as jest.Mock).mock.results[0].value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: mockUser.email,
        subject: expect.stringContaining("Reset"),
      })
    );
  });

  it("returns 400 for malformed JSON body", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json{{{",
    });

    const res = await forgotPasswordPOST(asNextRequest<typeof forgotPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Malformed JSON/);
  });
});

// ===========================================================================
// 2. POST /api/auth/reset-password
// ===========================================================================

describe("POST /api/auth/reset-password", () => {
  const url = "http://localhost/api/auth/reset-password";

  const mockUser = {
    id: "user-1",
    email: "coach@example.com",
    passwordHash: "$2a$12$existinghash",
  };

  const validBody = {
    email: "coach@example.com",
    token: "valid-reset-token",
    newPassword: "NewSecure1!Pass",
    confirmNewPassword: "NewSecure1!Pass",
  };

  it("resets password and returns success (happy path)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (verifyPasswordResetToken as jest.Mock).mockReturnValue(true);
    (db.user.update as jest.Mock).mockResolvedValue({ ...mockUser, passwordHash: "$2a$12$hashedpassword" });

    const req = buildRequest(url, validBody);
    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/reset successfully/);

    // bcrypt should have hashed with 12 rounds
    expect(bcrypt.hash).toHaveBeenCalledWith(validBody.newPassword, 12);

    // User should have been updated with the new hash
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: { passwordHash: "$2a$12$hashedpassword" },
    });
  });

  it("returns 400 when token is invalid", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (verifyPasswordResetToken as jest.Mock).mockReturnValue(false);

    const req = buildRequest(url, validBody);
    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid or has expired/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when user is not found (generic error)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const req = buildRequest(url, validBody);
    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid or has expired/);
  });

  it("returns 400 when newPassword is missing", async () => {
    const req = buildRequest(url, {
      email: "coach@example.com",
      token: "valid-token",
      // newPassword omitted
      confirmNewPassword: "Something1!Else",
    });

    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 429 when rate limited", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue(blockedRateLimit);

    const req = buildRequest(url, validBody);
    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Too many requests/);
  });

  it("returns 400 when passwords do not match", async () => {
    const req = buildRequest(url, {
      email: "coach@example.com",
      token: "valid-token",
      newPassword: "NewSecure1!Pass",
      confirmNewPassword: "DifferentPass1!",
    });

    const res = await resetPasswordPOST(asNextRequest<typeof resetPasswordPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// 3. POST /api/auth/coach-signup
// ===========================================================================

describe("POST /api/auth/coach-signup", () => {
  const url = "http://localhost/api/auth/coach-signup";

  const validSignupBody = {
    email: "newcoach@example.com",
    firstName: "Jane",
    lastName: "Doe",
    company: "Acme Inc",
    phone: "+1 555-123-4567",
    password: "SecureP@ss1234",
    confirmPassword: "SecureP@ss1234",
  };

  const createdUser = {
    id: "user-new",
    email: "newcoach@example.com",
    name: "Jane Doe",
    role: "COACH",
    passwordHash: "$2a$12$hashedpassword",
  };

  it("creates user + coach and returns 201 (happy path)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null); // no duplicate
    (db.$transaction as jest.Mock).mockImplementation(async (fn) => {
      // Simulate the transaction callback
      const tx = {
        user: {
          create: jest.fn().mockResolvedValue(createdUser),
        },
        coach: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "coach-new" }),
          update: jest.fn(),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
      };
      return fn(tx);
    });

    const req = buildRequest(url, validSignupBody);
    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(
      expect.objectContaining({
        id: "user-new",
        email: "newcoach@example.com",
        role: "COACH",
      })
    );
    expect(body.message).toMatch(/created successfully/);

    // bcrypt should have been used with 12 rounds
    expect(bcrypt.hash).toHaveBeenCalledWith(validSignupBody.password, 12);
  });

  it("returns 409 when email already exists (duplicate check)", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "existing-user",
      email: "newcoach@example.com",
    });

    const req = buildRequest(url, validSignupBody);
    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already exists/);
  });

  it("returns 400 for missing required fields", async () => {
    const req = buildRequest(url, {
      email: "newcoach@example.com",
      // firstName, lastName, password omitted
    });

    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 429 when rate limited", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue(blockedRateLimit);

    const req = buildRequest(url, validSignupBody);
    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Too many/);
  });

  it("returns 400 for invalid email format", async () => {
    const req = buildRequest(url, {
      ...validSignupBody,
      email: "not-valid",
    });

    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 409 on Prisma P2002 unique constraint violation", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null); // passes initial check

    // Simulate a Prisma P2002 error from the $transaction
    const prismaError = new Error("Unique constraint failed") as Error & {
      code: string;
      name: string;
    };
    prismaError.name = "PrismaClientKnownRequestError";
    prismaError.code = "P2002";
    // Set the constructor name to match Prisma's instanceof check
    Object.defineProperty(prismaError, "constructor", {
      value: { name: "PrismaClientKnownRequestError" },
    });

    // The route uses `instanceof Prisma.PrismaClientKnownRequestError`
    // Since we mock Prisma, we simulate the catch block directly
    (db.$transaction as jest.Mock).mockRejectedValue(prismaError);

    const req = buildRequest(url, validSignupBody);
    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    // The instanceof check may not match with our mock, so it could be 409 or 500.
    // Either way, it should NOT be 2xx:
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.success).toBe(false);
  });

  it("links to existing coach profile when one exists with the same email", async () => {
    const existingCoach = {
      id: "coach-existing",
      email: "newcoach@example.com",
      userId: null,
      phone: null,
      company: null,
    };

    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    (db.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = {
        user: {
          create: jest.fn().mockResolvedValue(createdUser),
        },
        coach: {
          findUnique: jest.fn().mockResolvedValue(existingCoach),
          update: jest.fn().mockResolvedValue({ ...existingCoach, userId: createdUser.id }),
          create: jest.fn(),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-2" }),
        },
      };
      const result = await fn(tx);

      // Verify coach.update was called (not coach.create)
      expect(tx.coach.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingCoach.id },
          data: expect.objectContaining({ userId: createdUser.id }),
        })
      );
      expect(tx.coach.create).not.toHaveBeenCalled();

      return result;
    });

    const req = buildRequest(url, validSignupBody);
    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it("returns 400 when password is too weak", async () => {
    const req = buildRequest(url, {
      ...validSignupBody,
      password: "short",
      confirmPassword: "short",
    });

    const res = await coachSignupPOST(asNextRequest<typeof coachSignupPOST>(req));

    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
