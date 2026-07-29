import type { ApiActor } from "@/lib/auth/access-control";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
  },
}));

const mockGetApiActor = jest.fn<Promise<ApiActor | null>, []>();
const mockIsReferredResultsEnabled = jest.fn<boolean, []>();
const mockListPublicReferrals = jest.fn();
const mockAssessmentTemplateFindMany = jest.fn();
const mockAssessmentSubmissionCount = jest.fn();

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: () => mockGetApiActor(),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockIsReferredResultsEnabled(),
}));

jest.mock("@/lib/assessments/public-referrals", () => ({
  listPublicReferrals: (...args: unknown[]) => mockListPublicReferrals(...args),
}));

jest.mock("@/lib/db", () => ({
  db: {
    marker: "database",
    assessmentTemplate: {
      findMany: (...args: unknown[]) =>
        mockAssessmentTemplateFindMany(...args),
    },
    assessmentSubmission: {
      count: (...args: unknown[]) => mockAssessmentSubmissionCount(...args),
    },
  },
}));

import { GET } from "@/app/api/assessments/referred-results/route";

const ownerActor: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function request(search = ""): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(
      `https://platform.example/api/assessments/referred-results${search}`,
    ),
  } as Parameters<typeof GET>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsReferredResultsEnabled.mockReturnValue(true);
  mockGetApiActor.mockResolvedValue(ownerActor);
  mockListPublicReferrals.mockResolvedValue({
    status: "ok",
    items: [],
    nextCursor: null,
  });
  mockAssessmentTemplateFindMany.mockResolvedValue([
    { id: "tpl-1", name: "Scaling Up 4 Decisions" },
    { id: "tpl-2", name: "Leadership Qualitative Assessment" },
  ]);
  mockAssessmentSubmissionCount.mockResolvedValue(18);
});

describe("GET /api/assessments/referred-results", () => {
  it("returns a dark 404 while the read surface is disabled", async () => {
    mockIsReferredResultsEnabled.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mockGetApiActor).not.toHaveBeenCalled();
    expect(mockListPublicReferrals).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated actor", async () => {
    mockGetApiActor.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Authentication required",
    });
    expect(mockListPublicReferrals).not.toHaveBeenCalled();
  });

  it("rejects a Coach actor without an immutable Coach ID", async () => {
    mockGetApiActor.mockResolvedValue({ ...ownerActor, coachId: null });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockListPublicReferrals).not.toHaveBeenCalled();
  });

  it("rejects non-Coach actors even if they carry a Coach ID", async () => {
    mockGetApiActor.mockResolvedValue({
      ...ownerActor,
      role: "STAFF",
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockListPublicReferrals).not.toHaveBeenCalled();
  });

  it("returns only the display-safe list contract for the owning Coach", async () => {
    mockListPublicReferrals.mockResolvedValue({
      status: "ok",
      items: [
        {
          submissionId: "sub-1",
          submittedAt: new Date("2026-07-10T02:42:00.000Z"),
          takerName: "Jordan Lee",
          takerEmail: "jordan@example.com",
          template: {
            id: "tpl-1",
            name: "Scaling Up 4 Decisions",
            alias: "scaling-up-quick",
          },
          summary: {
            kind: "scored",
            overallScore: 7.4,
            tierLabel: "Accelerating",
            domains: [
              { key: "people", label: "People", score: 8.1 },
            ],
          },
        },
      ],
      nextCursor: "sub-1",
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      items: [
        {
          submissionId: "sub-1",
          submittedAt: "2026-07-10T02:42:00.000Z",
          takerName: "Jordan Lee",
          takerEmail: "jordan@example.com",
          template: {
            id: "tpl-1",
            name: "Scaling Up 4 Decisions",
            alias: "scaling-up-quick",
          },
          summary: {
            kind: "scored",
            overallScore: 7.4,
            tierLabel: "Accelerating",
            domains: [
              { key: "people", label: "People", score: 8.1 },
            ],
          },
        },
      ],
      nextCursor: "sub-1",
      assessmentOptions: [
        { id: "tpl-1", name: "Scaling Up 4 Decisions" },
        { id: "tpl-2", name: "Leadership Qualitative Assessment" },
      ],
      totalCount: 18,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /answers|referringCoachEmail|rawResult/i,
    );
  });

  it("maps a loader eligibility denial to 403", async () => {
    mockListPublicReferrals.mockResolvedValue({ status: "forbidden" });

    const response = await GET(request());

    expect(response.status).toBe(403);
  });

  it("validates query parameters before calling the loader", async () => {
    for (const search of [
      "?take=0",
      "?take=26",
      "?take=2.5",
      "?take=not-a-number",
      "?templateId=",
      "?cursor=",
      `?query=${"x".repeat(201)}`,
      "?unexpected=value",
    ]) {
      const response = await GET(request(search));
      expect(response.status).toBe(400);
    }

    expect(mockListPublicReferrals).not.toHaveBeenCalled();
  });

  it("passes normalized search, filter, cursor, and page size to the loader", async () => {
    const response = await GET(
      request(
        "?query=%20Jordan%20&templateId=%20tpl-1%20&cursor=%20sub-9%20&take=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockListPublicReferrals).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "database" }),
      ownerActor,
      {
        query: "Jordan",
        templateId: "tpl-1",
        cursor: "sub-9",
        take: 25,
      },
    );
  });

  it("returns complete display-safe filter options and an unfiltered owned total", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(body.assessmentOptions).toEqual([
      { id: "tpl-1", name: "Scaling Up 4 Decisions" },
      { id: "tpl-2", name: "Leadership Qualitative Assessment" },
    ]);
    expect(body.totalCount).toBe(18);
    expect(mockAssessmentTemplateFindMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        campaigns: {
          some: {
            accessMode: "PUBLIC",
            deletedAt: null,
            submissions: {
              some: { referringCoachId: "coach-1" },
            },
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    expect(mockAssessmentSubmissionCount).toHaveBeenCalledWith({
      where: {
        referringCoachId: "coach-1",
        campaign: {
          accessMode: "PUBLIC",
          deletedAt: null,
        },
      },
    });
  });
});
