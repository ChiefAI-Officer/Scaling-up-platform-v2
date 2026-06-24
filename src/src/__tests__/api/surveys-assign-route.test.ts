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
  createSurveyForWorkshop: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { POST } from "@/app/api/surveys/assign/route";
import { createSurveyForWorkshop } from "@/lib/surveys/survey-service";

const ADMIN = { userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null };
const COACH = { userId: "u3", email: "c@x.com", role: "COACH", coachId: "coach-1" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown) => ({ json: async () => body }) as any;

const validBody = { templateId: "tpl-1", workshopId: "ws-1" };

describe("POST /api/surveys/assign — ADMIN-gated (audit PR-1 sweep find)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("blocks a COACH from assigning a survey to any workshop (403)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(COACH);
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(createSurveyForWorkshop).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to assign a survey (201)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
    (createSurveyForWorkshop as jest.Mock).mockResolvedValue({ id: "survey-1" });
    const res = await POST(req(validBody));
    expect(res.status).toBe(201);
    expect(createSurveyForWorkshop).toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(createSurveyForWorkshop).not.toHaveBeenCalled();
  });
});
