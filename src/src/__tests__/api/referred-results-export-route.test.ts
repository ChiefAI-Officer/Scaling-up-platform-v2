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
const mockEnabled = jest.fn<boolean, []>();
const mockExport = jest.fn();
const mockRate = jest.fn();
const mockAudit = jest.fn();

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: () => mockGetApiActor(),
}));
jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockEnabled(),
}));
jest.mock("@/lib/assessments/public-referrals", () => ({
  exportPublicReferrals: (...args: unknown[]) => mockExport(...args),
}));
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitStrict: (...args: unknown[]) => mockRate(...args),
}));
jest.mock("@/lib/audit", () => ({
  logAuditStrict: (...args: unknown[]) => mockAudit(...args),
}));
jest.mock("@/lib/db", () => ({ db: { marker: "db" } }));

import { GET } from "@/app/api/assessments/referred-results/export.csv/route";

const owner: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};

function request(search = ""): Parameters<typeof GET>[0] {
  return {
    nextUrl: new URL(
      `https://platform.example/api/assessments/referred-results/export.csv${search}`,
    ),
    headers: new Headers({ "x-request-id": "request-1" }),
  } as Parameters<typeof GET>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled.mockReturnValue(true);
  mockGetApiActor.mockResolvedValue(owner);
  mockRate.mockResolvedValue({
    success: true,
    remaining: 9,
    resetAt: 1234,
  });
  mockAudit.mockResolvedValue(undefined);
  mockExport.mockResolvedValue({
    status: "ok",
    totalCount: 1,
    rows: [
      {
        takerName: "=Formula",
        takerEmail: "taker@example.com",
        assessmentName: "Scaling Up Full",
        resultLabel: "72",
        submittedAt: new Date("2026-07-30T01:02:03.000Z"),
      },
    ],
  });
});

it("exports the filtered five-column CSV with formula protection and strict audit", async () => {
  const response = await GET(request("?query=jordan&templateId=tpl-1"));
  const csv = String(
    (response as unknown as { _body?: unknown })._body ?? "",
  );

  expect(response.status).toBe(200);
  const headers = response.headers as unknown as Map<string, string>;
  expect(
    headers.get("Content-Type") ?? headers.get("content-type"),
  ).toContain("text/csv");
  expect(csv).toContain(
    '"Taker Name","Taker Email","Assessment","Result","Submitted At"',
  );
  expect(csv).toContain('"\'=Formula"');
  expect(mockExport).toHaveBeenCalledWith(
    { marker: "db" },
    owner,
    { query: "jordan", templateId: "tpl-1" },
  );
  expect(mockRate).toHaveBeenCalledWith(
    "referred-results-export:coach-1",
    { interval: 60_000, maxRequests: 10 },
  );
  expect(mockAudit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "EXPORT",
      entityId: "coach-1",
      changes: expect.objectContaining({
        kind: "referred-results",
        requestId: "request-1",
        rows: 1,
        queryApplied: true,
        templateFilterApplied: true,
      }),
    }),
  );
});

it("returns 422 without auditing when filters still exceed the cap", async () => {
  mockExport.mockResolvedValue({
    status: "too-many",
    totalCount: 5001,
    maxAllowed: 5000,
  });

  const response = await GET(request());
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    error: "too_many_results",
    totalCount: 5001,
    maxAllowed: 5000,
  });
  expect(mockAudit).not.toHaveBeenCalled();
});

it("fails closed before querying when the distributed limiter is unavailable", async () => {
  mockRate.mockRejectedValue(new Error("redis unavailable"));

  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(mockExport).not.toHaveBeenCalled();
});

it("fails closed when the export audit cannot be persisted", async () => {
  mockAudit.mockRejectedValue(new Error("audit unavailable"));

  const response = await GET(request());
  expect(response.status).toBe(503);
});

it("preserves the feature, authentication, and immutable Coach-ID guards", async () => {
  mockEnabled.mockReturnValue(false);
  expect((await GET(request())).status).toBe(404);

  mockEnabled.mockReturnValue(true);
  mockGetApiActor.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);

  mockGetApiActor.mockResolvedValue({ ...owner, coachId: null });
  expect((await GET(request())).status).toBe(403);
  expect(mockExport).not.toHaveBeenCalled();
});
