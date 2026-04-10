jest.mock("next/server", () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new MockNextResponse(JSON.stringify(body), {
        status: init?.status || 200,
        headers: {
          "content-type": "application/json",
          ...(init?.headers || {}),
        },
      });
    }
  }

  return {
    NextResponse: MockNextResponse,
  };
});

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/files/file-service", () => ({
  getFile: jest.fn(),
}));

jest.mock("@/lib/files/file-access", () => ({
  canRoleAccessAttachment: jest.fn(),
  verifyFileAccessToken: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

import { GET } from "@/app/api/files/[id]/download/route";
import { getServerSession } from "next-auth";
import { getApiActor } from "@/lib/auth/authorization";
import { getFile } from "@/lib/files/file-service";
import { canRoleAccessAttachment, verifyFileAccessToken } from "@/lib/files/file-access";

function routeParams(id = "file-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(url: string): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/files/[id]/download", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: "file-body",
    }) as unknown as typeof fetch;
    (getFile as jest.Mock).mockResolvedValue({
      id: "file-1",
      filename: "Protected.pdf",
      blobUrl: "https://blob.example.com/protected.pdf",
      contentType: "application/pdf",
      workshopId: "ws-1",
      uploadedBy: "uploader-1",
      workshop: {
        coachId: "coach-1",
        status: "PRE_EVENT",
      },
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns 401 for unauthenticated requests without a token", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      buildRequest("http://localhost/api/files/file-1/download"),
      routeParams("file-1")
    );

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows the assigned coach when access rules permit delivery", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "coach-user-1", email: "coach@example.com" },
    });
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user-1",
      email: "coach@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    (canRoleAccessAttachment as jest.Mock).mockReturnValue(true);

    const response = await GET(
      buildRequest("http://localhost/api/files/file-1/download"),
      routeParams("file-1")
    );

    expect(response.status).toBe(200);
    expect(canRoleAccessAttachment).toHaveBeenCalledWith({
      recipientRole: "COACH",
      workshopStatus: "PRE_EVENT",
    });
    expect(global.fetch).toHaveBeenCalledWith("https://blob.example.com/protected.pdf");
  });

  it("returns 403 for a coach who does not own the workshop", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "coach-user-2", email: "other@example.com" },
    });
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "coach-user-2",
      email: "other@example.com",
      role: "COACH",
      coachId: "coach-2",
    });

    const response = await GET(
      buildRequest("http://localhost/api/files/file-1/download"),
      routeParams("file-1")
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(canRoleAccessAttachment).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid tokens", async () => {
    (verifyFileAccessToken as jest.Mock).mockReturnValue(null);

    const response = await GET(
      buildRequest("http://localhost/api/files/file-1/download?token=invalid"),
      routeParams("file-1")
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid or expired token");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows admins to download any file", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com" },
    });
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });

    const response = await GET(
      buildRequest("http://localhost/api/files/file-1/download"),
      routeParams("file-1")
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith("https://blob.example.com/protected.pdf");
  });

  it("returns 404 when the file does not exist", async () => {
    (getFile as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      buildRequest("http://localhost/api/files/missing/download"),
      routeParams("missing")
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("File not found");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
