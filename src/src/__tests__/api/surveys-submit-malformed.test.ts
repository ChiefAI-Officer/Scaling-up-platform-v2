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
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
  RateLimits: { registration: {} },
}));

jest.mock("@/lib/surveys/survey-service", () => ({
  submitSurveyResponse: jest.fn(),
}));

import { POST } from "@/app/api/surveys/[id]/submit/route";
import { submitSurveyResponse } from "@/lib/surveys/survey-service";

const params = (id = "s1") => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const malformedReq = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as any;

describe("POST /api/surveys/[id]/submit — malformed body (audit PR-4)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 (not an unhandled 500) when the JSON body is malformed", async () => {
    const res = await POST(malformedReq(), params());
    expect(res.status).toBe(400);
    expect(submitSurveyResponse).not.toHaveBeenCalled();
  });
});
