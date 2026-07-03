/**
 * Wave Q (#7, ADR-0018) — JWT-only gap closure (spec 19q auth-surface audit).
 *
 * These routes previously authenticated with raw getServerSession (JWT only):
 * a soft-removed admin holding a live 30-day JWT could keep using them. They
 * now resolve auth through getApiActor(), which liveness-checks deletedAt.
 *
 * THE test shape here: getServerSession returns a perfectly valid session
 * (the stale-JWT case) while getApiActor resolves null (soft-removed user) —
 * the route must 401 WITHOUT touching its service layer. This proves the
 * route no longer trusts the raw session.
 *
 * Also pins the previously-untested GET /api/workflows list semantics
 * (ADMIN sees all, non-admin scoped to own createdBy).
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

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn(
    (role: string) => role === "ADMIN" || role === "STAFF"
  ),
  canManageCoachData: jest.fn(),
}));

jest.mock("@/lib/files/file-service", () => ({
  getFile: jest.fn(),
  deleteFile: jest.fn(),
  linkFileToWorkflowStep: jest.fn(),
  unlinkFileFromWorkflowStep: jest.fn(),
  mapFileForClient: jest.fn((f: unknown) => f),
}));

jest.mock("@/lib/files/file-access", () => ({
  canReadFile: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/workflows/workflow-service", () => ({
  listWorkflows: jest.fn(),
  createWorkflow: jest.fn(),
  duplicateWorkflow: jest.fn(),
  getWorkflow: jest.fn(),
  updateWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  assignWorkflowToWorkshop: jest.fn(),
  unassignWorkflow: jest.fn(),
}));

jest.mock("@/lib/surveys/survey-service", () => ({
  listSurveyTemplates: jest.fn(),
  createSurveyTemplate: jest.fn(),
  getSurveyTemplate: jest.fn(),
  updateSurveyTemplate: jest.fn(),
  deleteSurveyTemplate: jest.fn(),
  getSurveyResults: jest.fn(),
}));

jest.mock("@/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/db", () => ({
  db: {
    fileAttachment: { update: jest.fn() },
    workshop: { findUnique: jest.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { getApiActor } from "@/lib/auth/authorization";
import { DELETE as filesDELETE, PATCH as filesPATCH } from "@/app/api/files/[id]/route";
import { GET as workflowsListGET } from "@/app/api/workflows/route";
import { GET as workflowGET } from "@/app/api/workflows/[id]/route";
import { POST as assignPOST } from "@/app/api/workflows/[id]/assign/route";
import { GET as surveyTemplatesGET } from "@/app/api/survey-templates/route";
import { GET as surveyTemplateGET } from "@/app/api/survey-templates/[id]/route";
import { GET as surveyResultsGET } from "@/app/api/survey-templates/[id]/results/route";
import {
  getFile,
  deleteFile,
} from "@/lib/files/file-service";
import {
  listWorkflows,
  getWorkflow,
  assignWorkflowToWorkshop,
} from "@/lib/workflows/workflow-service";
import {
  listSurveyTemplates,
  getSurveyTemplate,
  getSurveyResults,
} from "@/lib/surveys/survey-service";

// The stale-JWT scenario: the 30-day token is still perfectly valid...
const STALE_VALID_SESSION = {
  user: { id: "removed-1", email: "removed@scalingup.com", role: "ADMIN" },
};

const ADMIN = { userId: "admin-1", email: "a@x.com", role: "ADMIN" as const, coachId: null };
const COACH = { userId: "coach-1", email: "c@x.com", role: "COACH" as const, coachId: "c1" };

const params = (id = "x-1") => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonReq = (body: unknown) => ({ json: async () => body }) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const urlReq = (url: string) =>
  ({ url, nextUrl: new URL(url), json: async () => ({}) }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  // ...but the user behind it was soft-removed: the liveness checkpoint says no.
  (getServerSession as jest.Mock).mockResolvedValue(STALE_VALID_SESSION);
  (getApiActor as jest.Mock).mockResolvedValue(null);
});

describe("soft-removed user with a live JWT → 401, service untouched", () => {
  it("DELETE /api/files/[id]", async () => {
    const res = await filesDELETE(jsonReq({}), params("file-1"));
    expect(res.status).toBe(401);
    expect(getFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("PATCH /api/files/[id]", async () => {
    const res = await filesPATCH(jsonReq({ category: "x" }), params("file-1"));
    expect(res.status).toBe(401);
    expect(getFile).not.toHaveBeenCalled();
  });

  it("GET /api/workflows", async () => {
    const res = await workflowsListGET(urlReq("http://x/api/workflows"));
    expect(res.status).toBe(401);
    expect(listWorkflows).not.toHaveBeenCalled();
  });

  it("GET /api/workflows/[id]", async () => {
    const res = await workflowGET(jsonReq({}), params("wf-1"));
    expect(res.status).toBe(401);
    expect(getWorkflow).not.toHaveBeenCalled();
  });

  it("POST /api/workflows/[id]/assign", async () => {
    const res = await assignPOST(jsonReq({ workshopId: "ws-1" }), params("wf-1"));
    expect(res.status).toBe(401);
    expect(assignWorkflowToWorkshop).not.toHaveBeenCalled();
  });

  it("GET /api/survey-templates", async () => {
    const res = await surveyTemplatesGET();
    expect(res.status).toBe(401);
    expect(listSurveyTemplates).not.toHaveBeenCalled();
  });

  it("GET /api/survey-templates/[id]", async () => {
    const res = await surveyTemplateGET(jsonReq({}), params("tpl-1"));
    expect(res.status).toBe(401);
    expect(getSurveyTemplate).not.toHaveBeenCalled();
  });

  it("GET /api/survey-templates/[id]/results", async () => {
    const res = await surveyResultsGET(
      urlReq("http://x/api/survey-templates/tpl-1/results"),
      params("tpl-1")
    );
    expect(res.status).toBe(401);
    expect(getSurveyResults).not.toHaveBeenCalled();
  });
});

describe("GET /api/workflows — list semantics preserved through the actor swap", () => {
  it("ADMIN sees all workflows (createdBy undefined)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (listWorkflows as jest.Mock).mockResolvedValue([]);

    const res = await workflowsListGET(urlReq("http://x/api/workflows"));

    expect(res.status).toBe(200);
    expect(listWorkflows).toHaveBeenCalledWith({
      templatesOnly: false,
      createdBy: undefined,
    });
  });

  it("non-admin stays scoped to their own createdBy (coach-accessible, unchanged)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    (listWorkflows as jest.Mock).mockResolvedValue([]);

    const res = await workflowsListGET(
      urlReq("http://x/api/workflows?templates=true")
    );

    expect(res.status).toBe(200);
    expect(listWorkflows).toHaveBeenCalledWith({
      templatesOnly: true,
      createdBy: "coach-1",
    });
  });
});
