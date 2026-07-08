/**
 * Wave Y — GET /api/admin/assessments/import-health (panel data route).
 * Admin/STAFF-gated read; wraps buildImportHealthSummary.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { status: init?.status || 200 }),
  },
}));

jest.mock("@/lib/db", () => ({ db: { auditLog: { count: jest.fn(), findMany: jest.fn() } } }));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/assessments/esperto-import/import-health", () => ({
  buildImportHealthSummary: jest.fn().mockResolvedValue({
    generatedAt: "x",
    alerting: { enabled: true },
    cron: {},
    history: {},
    volume: {},
    recent: [],
  }),
}));

import { GET } from "@/app/api/admin/assessments/import-health/route";
import { getApiActor } from "@/lib/auth/authorization";
import { buildImportHealthSummary } from "@/lib/assessments/esperto-import/import-health";

beforeEach(() => jest.clearAllMocks());

it("401 when unauthenticated", async () => {
  (getApiActor as jest.Mock).mockResolvedValue(null);
  const res = await GET();
  expect(res.status).toBe(401);
  expect(buildImportHealthSummary).not.toHaveBeenCalled();
});

it("403 for a non-privileged (COACH) actor", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({ role: "COACH", userId: "u", coachId: "c", email: "c@x" });
  const res = await GET();
  expect(res.status).toBe(403);
  expect(buildImportHealthSummary).not.toHaveBeenCalled();
});

it("200 with the summary for an ADMIN", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({ role: "ADMIN", userId: "a", coachId: null, email: "a@x" });
  const res = await GET();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.data.alerting.enabled).toBe(true);
  expect(buildImportHealthSummary).toHaveBeenCalledTimes(1);
});

it("500 (not a throw) when the summarizer fails", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({ role: "STAFF", userId: "s", coachId: null, email: "s@x" });
  (buildImportHealthSummary as jest.Mock).mockRejectedValueOnce(new Error("db down"));
  const res = await GET();
  expect(res.status).toBe(500);
});
