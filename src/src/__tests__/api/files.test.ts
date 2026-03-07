jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/file-service", () => ({
  uploadFile: jest.fn(),
  getFile: jest.fn(),
  listFiles: jest.fn(),
  deleteFile: jest.fn(),
  linkFileToWorkflowStep: jest.fn(),
  unlinkFileFromWorkflowStep: jest.fn(),
  validateFile: jest.fn(),
  mapFileForClient: jest.fn((f: unknown) => f),
}));

jest.mock("@/lib/authorization", () => ({
  getApiActor: jest.fn(),
  canManageCoachData: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/db", () => ({
  db: {
    fileAttachment: {
      update: jest.fn(),
    },
    workshop: {
      findUnique: jest.fn(),
    },
  },
}));

import { GET, POST } from "@/app/api/files/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/files/[id]/route";
import { getServerSession } from "next-auth";
import {
  uploadFile,
  getFile,
  listFiles,
  deleteFile,
  linkFileToWorkflowStep,
  unlinkFileFromWorkflowStep,
  validateFile,
  mapFileForClient,
} from "@/lib/file-service";
import { getApiActor, canManageCoachData } from "@/lib/authorization";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authenticatedSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      role: "COACH",
      ...overrides,
    },
  };
}

function buildGetRequest(url: string): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(url),
  } as unknown as Parameters<typeof GET>[0];
}

function buildPostRequest(formFields: Record<string, string | Blob>): Parameters<typeof POST>[0] {
  const fd = new FormData();
  for (const [key, val] of Object.entries(formFields)) {
    fd.append(key, val);
  }
  return {
    formData: async () => fd,
  } as unknown as Parameters<typeof POST>[0];
}

function routeParams(id = "file-1") {
  return { params: Promise.resolve({ id }) };
}

function buildPatchRequest(body: unknown): Parameters<typeof PATCH>[0] {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof PATCH>[0];
}

function buildDeleteRequest(): Parameters<typeof DELETE>[0] {
  return {} as unknown as Parameters<typeof DELETE>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Files API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      role: "COACH",
      coachId: "coach-1",
    });
    (canManageCoachData as jest.Mock).mockImplementation(
      (actor: { role: string; coachId: string | null }, coachId: string) =>
        actor.role === "ADMIN" || actor.role === "STAFF" || actor.coachId === coachId
    );
    (db.workshop.findUnique as jest.Mock).mockResolvedValue({ coachId: "coach-1" });
  });

  // -----------------------------------------------------------------------
  // GET /api/files
  // -----------------------------------------------------------------------
  describe("GET /api/files", () => {
    it("returns list of files for workshop", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());
      const mockFiles = [
        { id: "f1", filename: "report.pdf" },
        { id: "f2", filename: "slides.pptx" },
      ];
      (listFiles as jest.Mock).mockResolvedValue(mockFiles);
      (mapFileForClient as jest.Mock).mockImplementation((f) => f);

      const response = await GET(
        buildGetRequest("http://localhost/api/files?workshopId=ws-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(listFiles).toHaveBeenCalledWith(
        expect.objectContaining({ workshopId: "ws-1" })
      );
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const response = await GET(
        buildGetRequest("http://localhost/api/files")
      );

      expect(response.status).toBe(401);
      expect(listFiles).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/files
  // -----------------------------------------------------------------------
  describe("POST /api/files", () => {
    it("uploads file successfully, returns 201", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());
      (validateFile as jest.Mock).mockReturnValue(null);
      const mockRecord = { id: "f-new", filename: "doc.pdf" };
      (uploadFile as jest.Mock).mockResolvedValue(mockRecord);
      (mapFileForClient as jest.Mock).mockImplementation((f) => f);

      const file = new File(["content"], "doc.pdf", {
        type: "application/pdf",
      });

      const response = await POST(
        buildPostRequest({ file, workshopId: "ws-1" })
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedBy: "user-1",
          workshopId: "ws-1",
        })
      );
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const file = new File(["content"], "doc.pdf", {
        type: "application/pdf",
      });

      const response = await POST(buildPostRequest({ file }));

      expect(response.status).toBe(401);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid file (validation fails)", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());
      (validateFile as jest.Mock).mockReturnValue("File too large. Maximum size is 10MB");

      const file = new File(["huge"], "huge.bin", {
        type: "application/octet-stream",
      });

      const response = await POST(buildPostRequest({ file }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("File too large");
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it("returns 400 when no file is provided", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());

      const response = await POST(
        buildPostRequest({ workshopId: "ws-1" })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("No file provided");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/files/[id]
  // -----------------------------------------------------------------------
  describe("GET /api/files/[id]", () => {
    it("returns single file", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());
      const mockFile = { id: "file-1", filename: "report.pdf" };
      (getFile as jest.Mock).mockResolvedValue(mockFile);
      (mapFileForClient as jest.Mock).mockImplementation((f) => f);

      const response = await GET_BY_ID(
        {} as Parameters<typeof GET_BY_ID>[0],
        routeParams("file-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe("file-1");
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const response = await GET_BY_ID(
        {} as Parameters<typeof GET_BY_ID>[0],
        routeParams("file-1")
      );

      expect(response.status).toBe(401);
      expect(getFile).not.toHaveBeenCalled();
    });

    it("returns 404 when file not found", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession());
      (getFile as jest.Mock).mockResolvedValue(null);

      const response = await GET_BY_ID(
        {} as Parameters<typeof GET_BY_ID>[0],
        routeParams("nonexistent")
      );

      expect(response.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/files/[id]
  // -----------------------------------------------------------------------
  describe("DELETE /api/files/[id]", () => {
    it("owner can delete their file", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-1", role: "COACH" })
      );
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "mine.pdf",
      });
      (deleteFile as jest.Mock).mockResolvedValue({ success: true });

      const response = await DELETE(buildDeleteRequest(), routeParams("file-1"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(deleteFile).toHaveBeenCalledWith("file-1");
    });

    it("admin can delete any file", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "admin-1", role: "ADMIN" })
      );
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "other-user",
        filename: "theirs.pdf",
      });
      (deleteFile as jest.Mock).mockResolvedValue({ success: true });

      const response = await DELETE(buildDeleteRequest(), routeParams("file-1"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(deleteFile).toHaveBeenCalledWith("file-1");
    });

    it("non-owner non-admin gets 403", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-2", role: "COACH" })
      );
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "not-yours.pdf",
      });

      const response = await DELETE(buildDeleteRequest(), routeParams("file-1"));

      expect(response.status).toBe(403);
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it("returns 404 for non-existent file", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-1", role: "ADMIN" })
      );
      (getFile as jest.Mock).mockResolvedValue(null);

      const response = await DELETE(buildDeleteRequest(), routeParams("gone"));

      expect(response.status).toBe(404);
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const response = await DELETE(buildDeleteRequest(), routeParams("file-1"));

      expect(response.status).toBe(401);
      expect(getFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/files/[id]
  // -----------------------------------------------------------------------
  describe("PATCH /api/files/[id]", () => {
    it("links file to workflow step", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "admin-1", role: "ADMIN" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });
      const updatedFile = {
        id: "file-1",
        filename: "report.pdf",
        workflowStepId: "step-1",
      };
      (linkFileToWorkflowStep as jest.Mock).mockResolvedValue(updatedFile);
      (mapFileForClient as jest.Mock).mockImplementation((f) => f);

      const response = await PATCH(
        buildPatchRequest({ workflowStepId: "step-1" }),
        routeParams("file-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(linkFileToWorkflowStep).toHaveBeenCalledWith("file-1", "step-1");
    });

    it("unlinks file from workflow step when workflowStepId is null", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "admin-1", role: "ADMIN" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "admin-1",
        email: "admin@example.com",
        role: "ADMIN",
        coachId: null,
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });
      const updatedFile = {
        id: "file-1",
        filename: "report.pdf",
        workflowStepId: null,
      };
      (unlinkFileFromWorkflowStep as jest.Mock).mockResolvedValue(updatedFile);
      (mapFileForClient as jest.Mock).mockImplementation((f) => f);

      const response = await PATCH(
        buildPatchRequest({ workflowStepId: null }),
        routeParams("file-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(unlinkFileFromWorkflowStep).toHaveBeenCalledWith("file-1");
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const response = await PATCH(
        buildPatchRequest({ workflowStepId: "step-1" }),
        routeParams("file-1")
      );

      expect(response.status).toBe(401);
      expect(linkFileToWorkflowStep).not.toHaveBeenCalled();
    });

    it("owner can update file metadata", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-1", role: "COACH" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });
      (db.fileAttachment.update as jest.Mock).mockResolvedValue({
        id: "file-1",
        filename: "report.pdf",
        category: "resource",
        workshopId: "ws-1",
      });

      const response = await PATCH(
        buildPatchRequest({ category: "resource", workshopId: "ws-1" }),
        routeParams("file-1")
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(db.fileAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "file-1" },
          data: expect.objectContaining({
            category: "resource",
            workshopId: "ws-1",
          }),
        })
      );
    });

    it("blocks non-owner metadata edits", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-2", role: "COACH" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-2",
        email: "other@example.com",
        role: "COACH",
        coachId: "coach-2",
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });

      const response = await PATCH(
        buildPatchRequest({ category: "resource" }),
        routeParams("file-1")
      );

      expect(response.status).toBe(403);
      expect(db.fileAttachment.update).not.toHaveBeenCalled();
    });

    it("blocks owner from moving a file to another coach's workshop", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-1", role: "COACH" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });
      (db.workshop.findUnique as jest.Mock).mockResolvedValue({ coachId: "coach-2" });

      const response = await PATCH(
        buildPatchRequest({ workshopId: "ws-other" }),
        routeParams("file-1")
      );

      expect(response.status).toBe(403);
      expect(db.fileAttachment.update).not.toHaveBeenCalled();
    });

    it("blocks non-privileged workflow attachment changes", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(
        authenticatedSession({ id: "user-1", role: "COACH" })
      );
      (getApiActor as jest.Mock).mockResolvedValue({
        userId: "user-1",
        email: "coach@example.com",
        role: "COACH",
        coachId: "coach-1",
      });
      (getFile as jest.Mock).mockResolvedValue({
        id: "file-1",
        uploadedBy: "user-1",
        filename: "report.pdf",
        workshop: { coachId: "coach-1" },
      });

      const response = await PATCH(
        buildPatchRequest({ workflowStepId: "step-1" }),
        routeParams("file-1")
      );

      expect(response.status).toBe(403);
      expect(linkFileToWorkflowStep).not.toHaveBeenCalled();
    });
  });
});
