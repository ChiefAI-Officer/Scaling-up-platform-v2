jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@vercel/blob/client", () => ({
  handleUpload: jest.fn(),
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    workshop: {
      findUnique: jest.fn(),
    },
    fileAttachment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { POST } from "@/app/api/files/client-upload/route";
import { handleUpload } from "@vercel/blob/client";
import { getApiActor, canManageCoachData } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

describe("POST /api/files/client-upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageCoachData as jest.Mock).mockReturnValue(true);
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ coachId: "coach-1", workshopCode: "WS-1" });
    (db.fileAttachment.findFirst as jest.Mock).mockResolvedValue(null);
    (db.fileAttachment.create as jest.Mock).mockResolvedValue({ id: "file-1" });
  });

  it("requires authentication when generating a client token", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/files/client-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.generate-client-token",
          payload: {},
        }),
      }) as Parameters<typeof POST>[0]
    );

    expect(response.status).toBe(401);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("generates a client token for authenticated uploads", async () => {
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      coachId: null,
    });
    (handleUpload as jest.Mock).mockImplementation(async ({ onBeforeGenerateToken }) => {
      await onBeforeGenerateToken(
        "deck.pdf",
        JSON.stringify({
          originalFilename: "deck.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
          workshopId: null,
          category: "handout",
        }),
        false
      );

      return {
        type: "blob.generate-client-token",
        clientToken: "token-123",
      };
    });

    const response = await POST(
      new Request("http://localhost/api/files/client-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.generate-client-token",
          payload: {},
        }),
      }) as Parameters<typeof POST>[0]
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clientToken).toBe("token-123");
  });

  it("persists a database record when the blob upload completes", async () => {
    (handleUpload as jest.Mock).mockImplementation(async ({ onUploadCompleted }) => {
      await onUploadCompleted({
        blob: {
          url: "https://blob.vercel-storage.com/file.pdf",
        },
        tokenPayload: JSON.stringify({
          originalFilename: "deck.pdf",
          filename: "deck.pdf",
          contentType: "application/pdf",
          sizeBytes: 2048,
          workshopId: "ws-1",
          category: "handout",
          uploadedBy: "admin-1",
        }),
      });

      return {
        type: "blob.upload-completed",
        response: "ok",
      };
    });

    const response = await POST(
      new Request("http://localhost/api/files/client-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "blob.upload-completed",
          payload: {},
        }),
      }) as Parameters<typeof POST>[0]
    );

    expect(response.status).toBe(200);
    expect(db.fileAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: "deck.pdf",
          workshopId: "ws-1",
          uploadedBy: "admin-1",
        }),
      })
    );
  });
});
