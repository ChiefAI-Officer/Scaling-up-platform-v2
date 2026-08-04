jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
}));

jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));
jest.mock("@/lib/assessments/wave-s-flags", () => ({
  isPeerBenchmarksEnabled: jest.fn(),
}));
jest.mock("@/lib/assessments/peer-benchmark-audit", () => ({
  buildPeerBenchmarkAuditSnapshot: jest.fn(),
}));

import {
  dynamic,
  GET,
} from "@/app/api/admin/assessments/peer-benchmark-status/route";
import { getApiActor } from "@/lib/auth/authorization";
import { buildPeerBenchmarkAuditSnapshot } from "@/lib/assessments/peer-benchmark-audit";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";

const snapshot = {
  generatedAt: "2026-08-04T06:00:00.000Z",
  targetAlias: "leadership-vision-alignment",
  effectiveGate: { state: "known", value: "dark" },
  template: { state: "known", value: "present" },
  activeVersion: {
    state: "known",
    value: {
      versionNumber: 3,
      language: "enUS",
      publishedAt: "2026-07-02T16:20:09.782Z",
      ratingQuestionCount: 16,
    },
  },
  storedBenchmarks: { state: "known", value: { storedRowCount: 0 } },
  keyCoverage: {
    state: "known",
    value: {
      matchingRowCount: 0,
      missingRatingQuestionCount: 16,
      staleRowCount: 0,
    },
  },
  readiness: "dark",
} as const;

const partialEvidenceSnapshot = {
  generatedAt: "2026-08-04T06:00:00.000Z",
  targetAlias: "leadership-vision-alignment",
  effectiveGate: { state: "known", value: "enabled" },
  template: { state: "known", value: "present" },
  activeVersion: { state: "unknown", reason: "query_failed" },
  storedBenchmarks: { state: "known", value: { storedRowCount: 1 } },
  keyCoverage: { state: "unknown", reason: "dependency_unknown" },
  readiness: "unknown",
} as const;

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  (isPeerBenchmarksEnabled as jest.Mock).mockReturnValue(false);
  (buildPeerBenchmarkAuditSnapshot as jest.Mock).mockResolvedValue(snapshot);
});

it("is force-dynamic", () => {
  expect(dynamic).toBe("force-dynamic");
});

it("returns 401 without querying status when unauthenticated", async () => {
  (getApiActor as jest.Mock).mockResolvedValue(null);
  const response = await GET();
  expect(response.status).toBe(401);
  expect(buildPeerBenchmarkAuditSnapshot).not.toHaveBeenCalled();
});

it("returns 403 for a COACH", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "COACH",
    userId: "coach",
    coachId: "c1",
    email: "coach@example.com",
  });
  const response = await GET();
  expect(response.status).toBe(403);
  expect(buildPeerBenchmarkAuditSnapshot).not.toHaveBeenCalled();
});

it.each(["ADMIN", "STAFF"])(
  "returns a no-store snapshot for %s",
  async (role) => {
    (getApiActor as jest.Mock).mockResolvedValue({
      role,
      userId: role.toLowerCase(),
      coachId: null,
      email: `${role.toLowerCase()}@example.com`,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, data: snapshot });
    expect(buildPeerBenchmarkAuditSnapshot).toHaveBeenCalledWith({
      db: expect.anything(),
      now: expect.any(Date),
      effectiveGate: { state: "known", value: "dark" },
    });
  },
);

it("returns partial evidence as a successful snapshot", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "ADMIN",
    userId: "admin",
    coachId: null,
    email: "admin@example.com",
  });
  (buildPeerBenchmarkAuditSnapshot as jest.Mock).mockResolvedValueOnce(
    partialEvidenceSnapshot,
  );

  const response = await GET();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: partialEvidenceSnapshot,
  });
});

it("passes enabled without exposing the environment inputs", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "ADMIN",
    userId: "a",
    coachId: null,
    email: "a@example.com",
  });
  (isPeerBenchmarksEnabled as jest.Mock).mockReturnValue(true);
  await GET();
  expect(buildPeerBenchmarkAuditSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      effectiveGate: { state: "known", value: "enabled" },
    }),
  );
});

it("returns 500 instead of throwing when the service fails unexpectedly", async () => {
  (getApiActor as jest.Mock).mockResolvedValue({
    role: "STAFF",
    userId: "s",
    coachId: null,
    email: "s@example.com",
  });
  (buildPeerBenchmarkAuditSnapshot as jest.Mock).mockRejectedValueOnce(
    new Error("unexpected"),
  );
  jest.spyOn(console, "error").mockImplementation(() => {});
  const response = await GET();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    success: false,
    error: "Failed to build peer benchmark status",
  });
});
