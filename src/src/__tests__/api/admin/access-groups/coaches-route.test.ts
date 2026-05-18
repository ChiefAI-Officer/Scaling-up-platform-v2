/**
 * Assessment v7.6 — POST + DELETE coach membership routes.
 * Asserts evaluateAccessChange is invoked inside a $transaction and that
 * BLOCKED_ZERO_ACCESS bubbles up as a 409 with the diff details.
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

const txMock = {
  accessGroupCoach: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  db: {
    accessGroupCoach: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) =>
      cb(txMock),
    ),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

const evaluateAccessChangeMock = jest.fn();
jest.mock("@/lib/assessments/evaluate-access-change", () => ({
  evaluateAccessChange: (...args: unknown[]) =>
    evaluateAccessChangeMock(...args),
}));

import { POST } from "@/app/api/admin/access-groups/[id]/coaches/route";
import { DELETE } from "@/app/api/admin/access-groups/[id]/coaches/[coachId]/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { AccessChangeError } from "@/lib/assessments/errors";

const adminActor = {
  userId: "admin-1",
  email: "admin@scalingup.com",
  role: "ADMIN" as const,
  coachId: null,
};
const coachActor = {
  userId: "u1",
  email: "coach@scalingup.com",
  role: "COACH" as const,
  coachId: "c1",
};

function asNextReq(url: string, init?: RequestInit): never {
  const req = new Request(url, init);
  return Object.assign(req, { nextUrl: new URL(url) }) as never;
}

function ctxAdd(id: string) {
  return { params: Promise.resolve({ id }) };
}
function ctxRemove(id: string, coachId: string) {
  return { params: Promise.resolve({ id, coachId }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  evaluateAccessChangeMock.mockResolvedValue({
    blocked: false,
    affectedCoachIds: [],
    forcedZeroCoachIds: [],
    auditLogId: "a1",
  });
});

describe("POST /api/admin/access-groups/[id]/coaches (add)", () => {
  it("403 coach actor", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches", {
        method: "POST",
        body: JSON.stringify({ coachId: "c2" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(403);
    expect(evaluateAccessChangeMock).not.toHaveBeenCalled();
  });

  it("409 duplicate membership pre-check", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue({ id: "x" });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches", {
        method: "POST",
        body: JSON.stringify({ coachId: "c2" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_MEMBERSHIP");
    expect(evaluateAccessChangeMock).not.toHaveBeenCalled();
  });

  it("200 happy path → evaluateAccessChange invoked then create", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue(null);
    txMock.accessGroupCoach.create.mockResolvedValue({
      id: "join-1",
      accessGroupId: "ag-1",
      coachId: "c2",
      addedAt: new Date(),
      coach: {
        id: "c2",
        firstName: "X",
        lastName: "Y",
        email: "xy@x.com",
        certificationStatus: "CERTIFIED",
      },
    });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches", {
        method: "POST",
        body: JSON.stringify({ coachId: "c2" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(200);
    expect(evaluateAccessChangeMock).toHaveBeenCalledTimes(1);
    expect(evaluateAccessChangeMock.mock.calls[0][1]).toMatchObject({
      kind: "ADD_COACH_TO_GROUP",
      accessGroupId: "ag-1",
      coachId: "c2",
      performedByUserId: "admin-1",
    });
    expect(txMock.accessGroupCoach.create).toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/access-groups/[id]/coaches/[coachId] (remove)", () => {
  it("404 not in group", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches/c2", {
        method: "DELETE",
      }),
      ctxRemove("ag-1", "c2"),
    );
    expect(res.status).toBe(404);
  });

  it("200 happy path → guard invoked then delete", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue({ id: "j1" });
    txMock.accessGroupCoach.delete.mockResolvedValue({ id: "j1" });
    const res = await DELETE(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches/c2", {
        method: "DELETE",
      }),
      ctxRemove("ag-1", "c2"),
    );
    expect(res.status).toBe(200);
    expect(evaluateAccessChangeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "REMOVE_COACH_FROM_GROUP",
        coachId: "c2",
        accessGroupId: "ag-1",
        force: false,
      }),
    );
    expect(txMock.accessGroupCoach.delete).toHaveBeenCalled();
  });

  it("409 BLOCKED_ZERO_ACCESS surfaces details to caller", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue({ id: "j1" });
    evaluateAccessChangeMock.mockRejectedValue(
      new AccessChangeError(
        "BLOCKED_ZERO_ACCESS",
        {
          affectedCoachIds: ["c2"],
          kind: "REMOVE_COACH_FROM_GROUP",
          accessGroupId: "ag-1",
        },
        "blocked",
      ),
    );
    const res = await DELETE(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/coaches/c2", {
        method: "DELETE",
      }),
      ctxRemove("ag-1", "c2"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("BLOCKED_ZERO_ACCESS");
    expect(body.details).toMatchObject({ affectedCoachIds: ["c2"] });
    expect(txMock.accessGroupCoach.delete).not.toHaveBeenCalled();
  });

  it("force=true with reason bypasses block", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupCoach.findUnique as jest.Mock).mockResolvedValue({ id: "j1" });
    txMock.accessGroupCoach.delete.mockResolvedValue({ id: "j1" });
    const res = await DELETE(
      asNextReq(
        "http://localhost/api/admin/access-groups/ag-1/coaches/c2?force=true&forceReason=ok",
        { method: "DELETE" },
      ),
      ctxRemove("ag-1", "c2"),
    );
    expect(res.status).toBe(200);
    expect(evaluateAccessChangeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        force: true,
        forceReason: "ok",
      }),
    );
  });
});
