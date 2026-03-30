jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { registration: { limit: 20, window: 60000 } },
  withRateLimit: jest.fn(),
}));

jest.mock("@/lib/survey-service", () => ({
  submitSurveyResponse: jest.fn(),
}));

import { POST } from "@/app/api/surveys/[id]/submit/route";
import { withRateLimit } from "@/lib/rate-limit";
import { submitSurveyResponse } from "@/lib/survey-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeParams(id = "survey-1") {
  return { params: Promise.resolve({ id }) };
}

function buildPostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/surveys/survey-1/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/surveys/[id]/submit", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: rate limit allows the request
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      headers: { "x-ratelimit-limit": "20" },
    });
  });

  // -----------------------------------------------------------------------
  // 1. Happy path
  // -----------------------------------------------------------------------
  it("submits survey with valid answers and returns 200", async () => {
    (submitSurveyResponse as jest.Mock).mockResolvedValue({ success: true });

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Excellent" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(submitSurveyResponse).toHaveBeenCalledWith("survey-1", [
      { questionId: "q-1", value: "Excellent" },
    ]);
  });

  // -----------------------------------------------------------------------
  // 2. Survey not found (404)
  // -----------------------------------------------------------------------
  it("returns 404 when survey does not exist", async () => {
    (submitSurveyResponse as jest.Mock).mockRejectedValue(
      new Error("Survey not found"),
    );

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Yes" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams("nonexistent-survey"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Survey not found");
  });

  // -----------------------------------------------------------------------
  // 3. Survey already completed (410)
  // -----------------------------------------------------------------------
  it("returns 410 when survey is already completed", async () => {
    (submitSurveyResponse as jest.Mock).mockRejectedValue(
      new Error("Survey already completed"),
    );

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Good" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toBe("Survey already completed");
  });

  // -----------------------------------------------------------------------
  // 4. Empty answers array (400)
  // -----------------------------------------------------------------------
  it("returns 400 when answers array is empty", async () => {
    const response = await POST(
      buildPostRequest({ answers: [] }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(body.details).toBeDefined();
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. Missing questionId (400)
  // -----------------------------------------------------------------------
  it("returns 400 when questionId is missing from an answer", async () => {
    const response = await POST(
      buildPostRequest({
        answers: [{ value: "Some answer" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. Missing value (400)
  // -----------------------------------------------------------------------
  it("returns 400 when value is missing from an answer", async () => {
    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. Question does not belong to survey (400)
  // -----------------------------------------------------------------------
  it("returns 400 when question does not belong to survey", async () => {
    (submitSurveyResponse as jest.Mock).mockRejectedValue(
      new Error("Invalid question IDs for this survey: q-unknown"),
    );

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-unknown", value: "Answer" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid question IDs/);
  });

  // -----------------------------------------------------------------------
  // 8. Rate limiting (429)
  // -----------------------------------------------------------------------
  it("returns 429 when rate limit is exceeded", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      headers: { "retry-after": "60" },
    });

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Yes" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Too many submissions. Please try again later.");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 9. Multiple answers in one request
  // -----------------------------------------------------------------------
  it("submits multiple answers in one request", async () => {
    (submitSurveyResponse as jest.Mock).mockResolvedValue({ success: true });

    const answers = [
      { questionId: "q-1", value: "Yes" },
      { questionId: "q-2", value: "Very satisfied" },
      { questionId: "q-3", value: "No additional comments" },
    ];

    const response = await POST(
      buildPostRequest({ answers }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(submitSurveyResponse).toHaveBeenCalledWith("survey-1", answers);
  });

  // -----------------------------------------------------------------------
  // 10. Optional numValue for NPS/rating questions
  // -----------------------------------------------------------------------
  it("passes optional numValue for NPS/rating questions", async () => {
    (submitSurveyResponse as jest.Mock).mockResolvedValue({ success: true });

    const answers = [
      { questionId: "q-nps", value: "9", numValue: 9 },
      { questionId: "q-rating", value: "4", numValue: 4 },
    ];

    const response = await POST(
      buildPostRequest({ answers }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(submitSurveyResponse).toHaveBeenCalledWith("survey-1", answers);
  });

  // -----------------------------------------------------------------------
  // 11. Invalid (empty string) survey ID (400)
  // -----------------------------------------------------------------------
  it("returns 400 for empty string survey ID", async () => {
    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Yes" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(""),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid survey id");
    expect(body.details).toBeDefined();
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 12. Server error (500)
  // -----------------------------------------------------------------------
  it("returns 500 for unexpected server errors", async () => {
    (submitSurveyResponse as jest.Mock).mockRejectedValue(
      new Error("Database connection lost"),
    );

    // Suppress the console.error the route handler logs
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Yes" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");

    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 13. Non-Error throw handled as 500
  // -----------------------------------------------------------------------
  it("returns 500 when a non-Error object is thrown", async () => {
    (submitSurveyResponse as jest.Mock).mockRejectedValue("string error");

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "q-1", value: "Yes" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");

    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // 14. Missing answers key entirely (400)
  // -----------------------------------------------------------------------
  it("returns 400 when the answers key is missing from body", async () => {
    const response = await POST(
      buildPostRequest({}) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 15. questionId as empty string (400 - Zod min(1))
  // -----------------------------------------------------------------------
  it("returns 400 when questionId is an empty string", async () => {
    const response = await POST(
      buildPostRequest({
        answers: [{ questionId: "", value: "Answer" }],
      }) as unknown as Parameters<typeof POST>[0],
      routeParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid request body");
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 16. Rate limit called with correct config
  // -----------------------------------------------------------------------
  it("calls withRateLimit with the registration rate limit config", async () => {
    (submitSurveyResponse as jest.Mock).mockResolvedValue({ success: true });

    const req = buildPostRequest({
      answers: [{ questionId: "q-1", value: "Yes" }],
    });

    await POST(req as unknown as Parameters<typeof POST>[0], routeParams());

    expect(withRateLimit).toHaveBeenCalledTimes(1);
    expect(withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 20, window: 60000 }),
    );
  });
});
