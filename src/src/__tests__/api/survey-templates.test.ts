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

jest.mock("@/lib/survey-service", () => ({
  createSurveyTemplate: jest.fn(),
  listSurveyTemplates: jest.fn(),
  getSurveyTemplate: jest.fn(),
  updateSurveyTemplate: jest.fn(),
  deleteSurveyTemplate: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { GET as GET_COLLECTION, POST } from "@/app/api/survey-templates/route";
import {
  GET as GET_BY_ID,
  PATCH,
  DELETE,
} from "@/app/api/survey-templates/[id]/route";
import {
  createSurveyTemplate,
  listSurveyTemplates,
  getSurveyTemplate,
  updateSurveyTemplate,
  deleteSurveyTemplate,
} from "@/lib/survey-service";

function authenticatedSession(role: "ADMIN" | "COACH" = "ADMIN") {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      role,
    },
  };
}

function routeParams(id = "tpl-1") {
  return { params: Promise.resolve({ id }) };
}

function buildRequest(body: unknown) {
  return {
    json: async () => body,
  } as Parameters<typeof POST>[0];
}

describe("Survey Templates API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks non-admin list access", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await GET_COLLECTION();

    expect(response.status).toBe(403);
    expect(listSurveyTemplates).not.toHaveBeenCalled();
  });

  it("blocks non-admin create access", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await POST(
      buildRequest({ name: "Post Event", surveyType: "POST_WORKSHOP" })
    );

    expect(response.status).toBe(403);
    expect(createSurveyTemplate).not.toHaveBeenCalled();
  });

  it("allows admin to fetch one template", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("ADMIN"));
    (getSurveyTemplate as jest.Mock).mockResolvedValue({ id: "tpl-1", name: "Post Event" });

    const response = await GET_BY_ID({} as Parameters<typeof GET_BY_ID>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe("tpl-1");
  });

  it("blocks non-admin delete access", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("COACH"));

    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());

    expect(response.status).toBe(403);
    expect(deleteSurveyTemplate).not.toHaveBeenCalled();
  });

  it("returns archived action when delete falls back to archive", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("ADMIN"));
    (deleteSurveyTemplate as jest.Mock).mockResolvedValue({
      action: "archived",
      template: {
        id: "tpl-1",
        isActive: false,
        _count: { surveys: 2 },
      },
    });

    const response = await DELETE({} as Parameters<typeof DELETE>[0], routeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.action).toBe("archived");
  });

  it("allows admin patch", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(authenticatedSession("ADMIN"));
    (updateSurveyTemplate as jest.Mock).mockResolvedValue({
      id: "tpl-1",
      name: "Updated",
    });

    const response = await PATCH(
      buildRequest({ name: "Updated" }) as Parameters<typeof PATCH>[0],
      routeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Updated");
  });
});
