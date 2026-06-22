jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));

jest.mock("@/lib/surveys/survey-service", () => ({
  addQuestion: jest.fn(),
  reorderQuestions: jest.fn(),
  updateQuestion: jest.fn(),
  deleteQuestion: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { POST as Q_POST, PATCH as Q_PATCH } from "@/app/api/survey-templates/[id]/questions/route";
import { PATCH as QID_PATCH, DELETE as QID_DELETE } from "@/app/api/survey-templates/[id]/questions/[questionId]/route";
import {
  addQuestion,
  reorderQuestions,
  updateQuestion,
  deleteQuestion,
} from "@/lib/surveys/survey-service";

const ADMIN = { userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null };
const COACH = { userId: "u3", email: "c@x.com", role: "COACH", coachId: "coach-1" };

const tplParams = (id = "tpl-1") => ({ params: Promise.resolve({ id }) });
const qParams = (id = "tpl-1", questionId = "q-1") => ({ params: Promise.resolve({ id, questionId }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

const validQuestion = { questionType: "TEXT", label: "Q1" };

describe("Survey-template question routes — ADMIN-gated (audit PR-1)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POST /questions blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await Q_POST(req(validQuestion), tplParams());
    expect(res.status).toBe(403);
    expect(addQuestion).not.toHaveBeenCalled();
  });

  it("POST /questions allows an ADMIN (201)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (addQuestion as jest.Mock).mockResolvedValue({ id: "q-1" });
    const res = await Q_POST(req(validQuestion), tplParams());
    expect(res.status).toBe(201);
    expect(addQuestion).toHaveBeenCalled();
  });

  it("POST /questions returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await Q_POST(req(validQuestion), tplParams());
    expect(res.status).toBe(401);
    expect(addQuestion).not.toHaveBeenCalled();
  });

  it("PATCH /questions (reorder) blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await Q_PATCH(req({ questionIds: ["a", "b"] }), tplParams());
    expect(res.status).toBe(403);
    expect(reorderQuestions).not.toHaveBeenCalled();
  });

  it("PATCH /questions (reorder) allows an ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    const res = await Q_PATCH(req({ questionIds: ["a", "b"] }), tplParams());
    expect(res.status).toBe(200);
    expect(reorderQuestions).toHaveBeenCalled();
  });

  it("PATCH /questions/[questionId] blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await QID_PATCH(req({ label: "x" }), qParams());
    expect(res.status).toBe(403);
    expect(updateQuestion).not.toHaveBeenCalled();
  });

  it("DELETE /questions/[questionId] blocks a COACH (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await QID_DELETE(req(undefined), qParams());
    expect(res.status).toBe(403);
    expect(deleteQuestion).not.toHaveBeenCalled();
  });

  it("DELETE /questions/[questionId] allows an ADMIN", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (deleteQuestion as jest.Mock).mockResolvedValue({ success: true });
    const res = await QID_DELETE(req(undefined), qParams());
    expect(res.status).toBe(200);
    expect(deleteQuestion).toHaveBeenCalled();
  });
});
