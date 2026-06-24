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
  isPrivilegedRole: (r: string) => r === "ADMIN" || r === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/inngest/client", () => ({ inngest: { send: jest.fn() } }));

jest.mock("@/lib/db", () => ({
  db: {
    workflowStep: { findUnique: jest.fn() },
    workflowStepExecution: { findFirst: jest.fn() },
  },
}));

import { POST } from "@/app/api/workflow-steps/[stepId]/trigger-now/route";
import { getApiActor } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";

const params = (stepId = "st-1") => ({ params: Promise.resolve({ stepId }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (body: unknown = { workshopId: "ws-1" }) => ({ json: async () => body }) as any;
const ADMIN = { userId: "u1", email: "a@x.com", role: "ADMIN", coachId: null };

describe("POST /api/workflow-steps/[stepId]/trigger-now — error handling (audit PR-4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
  });

  it("returns a structured 500 when a DB query throws (no unhandled rejection)", async () => {
    (db.workflowStep.findUnique as jest.Mock).mockRejectedValue(new Error("db down"));
    const res = await POST(req(), params());
    expect(res.status).toBe(500);
  });

  it("happy path: admin trigger fires inngest and returns success", async () => {
    (db.workflowStep.findUnique as jest.Mock).mockResolvedValue({ id: "st-1" });
    (db.workflowStepExecution.findFirst as jest.Mock).mockResolvedValue(null);
    (inngest.send as jest.Mock).mockResolvedValue(undefined);

    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    expect(inngest.send).toHaveBeenCalled();
  });
});
