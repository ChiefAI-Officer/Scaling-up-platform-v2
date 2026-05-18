/**
 * Assessment v7.6 — POST + DELETE template grant routes.
 * Mirrors the coaches-route test shape.
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
  accessGroupTemplate: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  db: {
    accessGroupTemplate: { findUnique: jest.fn() },
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

import { POST } from "@/app/api/admin/access-groups/[id]/templates/route";
import { DELETE } from "@/app/api/admin/access-groups/[id]/templates/[templateId]/route";
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
function ctxRemove(id: string, templateId: string) {
  return { params: Promise.resolve({ id, templateId }) };
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

describe("POST /api/admin/access-groups/[id]/templates", () => {
  it("403 coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/templates", {
        method: "POST",
        body: JSON.stringify({ templateId: "t1" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(403);
  });

  it("409 duplicate grant", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "x",
    });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/templates", {
        method: "POST",
        body: JSON.stringify({ templateId: "t1" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("DUPLICATE_GRANT");
    expect(evaluateAccessChangeMock).not.toHaveBeenCalled();
  });

  it("200 happy path", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupTemplate.findUnique as jest.Mock).mockResolvedValue(null);
    txMock.accessGroupTemplate.create.mockResolvedValue({
      id: "x",
      accessGroupId: "ag-1",
      templateId: "t1",
      addedAt: new Date(),
      template: {
        id: "t1",
        name: "Rockefeller",
        alias: "rkf",
        aggregationMode: "FULL_VISIBILITY",
      },
    });
    const res = await POST(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/templates", {
        method: "POST",
        body: JSON.stringify({ templateId: "t1" }),
      }),
      ctxAdd("ag-1"),
    );
    expect(res.status).toBe(200);
    expect(evaluateAccessChangeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "ADD_TEMPLATE_TO_GROUP",
        templateId: "t1",
        accessGroupId: "ag-1",
      }),
    );
  });
});

describe("DELETE /api/admin/access-groups/[id]/templates/[templateId]", () => {
  it("404 not in group", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupTemplate.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await DELETE(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/templates/t1", {
        method: "DELETE",
      }),
      ctxRemove("ag-1", "t1"),
    );
    expect(res.status).toBe(404);
  });

  it("409 BLOCKED_ZERO_ACCESS", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "x",
    });
    evaluateAccessChangeMock.mockRejectedValue(
      new AccessChangeError(
        "BLOCKED_ZERO_ACCESS",
        {
          affectedCoachIds: ["c2", "c3"],
          kind: "REMOVE_TEMPLATE_FROM_GROUP",
          accessGroupId: "ag-1",
        },
        "blocked",
      ),
    );
    const res = await DELETE(
      asNextReq("http://localhost/api/admin/access-groups/ag-1/templates/t1", {
        method: "DELETE",
      }),
      ctxRemove("ag-1", "t1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("BLOCKED_ZERO_ACCESS");
    expect(body.details.affectedCoachIds).toEqual(["c2", "c3"]);
    expect(txMock.accessGroupTemplate.delete).not.toHaveBeenCalled();
  });

  it("force=true with reason bypasses block", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (db.accessGroupTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "x",
    });
    txMock.accessGroupTemplate.delete.mockResolvedValue({ id: "x" });
    const res = await DELETE(
      asNextReq(
        "http://localhost/api/admin/access-groups/ag-1/templates/t1?force=true&forceReason=needed",
        { method: "DELETE" },
      ),
      ctxRemove("ag-1", "t1"),
    );
    expect(res.status).toBe(200);
    expect(evaluateAccessChangeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        force: true,
        forceReason: "needed",
      }),
    );
  });
});
