jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200 }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/auth/coach-password-actions-flags", () => ({
  isCoachPasswordActionsEnabled: jest.fn(),
}));

jest.mock("@/lib/auth/password-credentials", () => ({
  rotateUserPassword: jest.fn().mockResolvedValue({ id: "user-1", authVersion: 2 }),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$hashed"),
}));

jest.mock("@/services/notifications", () => ({
  sendCoachPasswordSetByAdminEmail: jest.fn().mockResolvedValue(undefined),
}));

const tx = { user: { update: jest.fn() }, auditLog: { create: jest.fn() } };
jest.mock("@/lib/db", () => ({
  db: {
    coach: { findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
  },
}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";
import { rotateUserPassword } from "@/lib/auth/password-credentials";
import { sendCoachPasswordSetByAdminEmail } from "@/services/notifications";
import { POST as setPassword } from "@/app/api/coaches/[id]/set-password/route";
import { POST as retryNotification } from "@/app/api/coaches/[id]/password-set-notification/route";

const ADMIN = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
};

const COACH = {
  id: "coach-1",
  email: "coach@example.com",
  firstName: "Casey",
  lastName: "Coach",
  user: {
    id: "user-1",
    role: "COACH",
    deletedAt: null,
  },
};

const params = { params: Promise.resolve({ id: "coach-1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/coaches/coach-1/set-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validBody = {
  newPassword: "StrongPass1!",
  confirmNewPassword: "StrongPass1!",
};

describe("POST /api/coaches/[id]/set-password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (db.coach.findUnique as jest.Mock).mockResolvedValue(COACH);
    (sendCoachPasswordSetByAdminEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it("is undiscoverable while the feature is off", async () => {
    (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(false);

    const response = await setPassword(request(validBody), params);

    expect(response.status).toBe(404);
    expect(getApiActor).not.toHaveBeenCalled();
  });

  it("requires authentication and ADMIN role", async () => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(null);
    expect((await setPassword(request(validBody), params)).status).toBe(401);

    for (const role of ["STAFF", "COACH"]) {
      (getApiActor as jest.Mock).mockResolvedValueOnce({ ...ADMIN, role });
      expect((await setPassword(request(validBody), params)).status).toBe(403);
    }
  });

  it("returns 404 for a missing coach and 409 for unsafe account links", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValueOnce(null);
    expect((await setPassword(request(validBody), params)).status).toBe(404);

    for (const user of [
      null,
      { ...COACH.user, deletedAt: new Date("2026-08-17") },
      { ...COACH.user, role: "ADMIN" },
      { ...COACH.user, role: "STAFF" },
    ]) {
      (db.coach.findUnique as jest.Mock).mockResolvedValueOnce({ ...COACH, user });
      expect((await setPassword(request(validBody), params)).status).toBe(409);
    }
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("rejects weak or mismatched passwords before hashing", async () => {
    expect(
      (await setPassword(request({ ...validBody, newPassword: "weak" }), params)).status,
    ).toBe(400);
    expect(
      (
        await setPassword(
          request({ ...validBody, confirmNewPassword: "Different1!" }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("rotates the credential transactionally and sends a non-secret notification", async () => {
    const response = await setPassword(request(validBody), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      passwordUpdated: true,
      notificationSent: true,
    });
    expect(JSON.stringify(body)).not.toContain(validBody.newPassword);
    expect(bcrypt.hash).toHaveBeenCalledWith(validBody.newPassword, 12);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(rotateUserPassword).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "user-1",
        passwordHash: "$2a$12$hashed",
        action: "ADMIN_PASSWORD_SET",
        performedBy: "admin@example.com",
        changes: { coachId: "coach-1", role: "COACH" },
      }),
    );
    expect(sendCoachPasswordSetByAdminEmail).toHaveBeenCalledWith({
      coachEmail: "coach@example.com",
      coachName: "Casey Coach",
    });
  });

  it("keeps the new password committed and returns a retryable warning if email fails", async () => {
    (sendCoachPasswordSetByAdminEmail as jest.Mock).mockRejectedValue(
      new Error("SMTP unavailable"),
    );

    const response = await setPassword(request(validBody), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      passwordUpdated: true,
      notificationSent: false,
    });
    expect(body.warning).toMatch(/notification/i);
    expect(rotateUserPassword).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/coaches/[id]/password-set-notification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isCoachPasswordActionsEnabled as jest.Mock).mockReturnValue(true);
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (db.coach.findUnique as jest.Mock).mockResolvedValue(COACH);
    (sendCoachPasswordSetByAdminEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it("retries only the notification without touching credentials", async () => {
    const response = await retryNotification(request({}), params);

    expect(response.status).toBe(200);
    expect(sendCoachPasswordSetByAdminEmail).toHaveBeenCalledWith({
      coachEmail: "coach@example.com",
      coachName: "Casey Coach",
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(rotateUserPassword).not.toHaveBeenCalled();
  });
});
