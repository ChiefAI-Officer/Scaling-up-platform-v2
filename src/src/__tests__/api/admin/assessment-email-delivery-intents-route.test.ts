jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => {
      const text = JSON.stringify(body);
      return {
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
        json: async () => JSON.parse(text),
        text: async () => text,
      };
    },
  },
}));

jest.mock("@/lib/db", () => ({
  db: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: (role: string) => role === "ADMIN" || role === "STAFF",
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: { name: "standard" } },
  withRateLimit: jest.fn(),
}));

const operatorDeps = { name: "production-operator-deps" };

jest.mock("@/lib/assessments/assessment-email-intent-operator", () => {
  const actual = jest.requireActual(
    "@/lib/assessments/assessment-email-intent-operator",
  );
  return {
    ...actual,
    loadHeldIntentDetail: jest.fn(),
    releaseHeldIntent: jest.fn(),
    cancelHeldIntent: jest.fn(),
    productionAssessmentEmailIntentOperatorDeps: jest.fn(() => operatorDeps),
  };
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GET as listHeldIntents } from "@/app/api/admin/assessment-email-delivery-intents/route";
import { GET as getHeldIntent } from "@/app/api/admin/assessment-email-delivery-intents/[id]/route";
import { POST as releaseHeldIntentRoute } from "@/app/api/admin/assessment-email-delivery-intents/[id]/release/route";
import { POST as cancelHeldIntentRoute } from "@/app/api/admin/assessment-email-delivery-intents/[id]/cancel/route";
import * as listRouteModule from "@/app/api/admin/assessment-email-delivery-intents/route";
import * as detailRouteModule from "@/app/api/admin/assessment-email-delivery-intents/[id]/route";
import * as releaseRouteModule from "@/app/api/admin/assessment-email-delivery-intents/[id]/release/route";
import * as cancelRouteModule from "@/app/api/admin/assessment-email-delivery-intents/[id]/cancel/route";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  OperatorServiceError,
  cancelHeldIntent,
  loadHeldIntentDetail,
  productionAssessmentEmailIntentOperatorDeps,
  releaseHeldIntent,
  type OperatorServiceErrorCode,
} from "@/lib/assessments/assessment-email-intent-operator";

const ADMIN = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};
const STAFF = {
  userId: "staff-1",
  email: "staff@example.com",
  role: "STAFF" as const,
  coachId: null,
};
const COACH = {
  userId: "coach-1",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "coach-profile-1",
};

const params = { params: Promise.resolve({ id: "intent-1" }) };
const privacyHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
};

const provenance = {
  schemaVersion: 1,
  templateId: "template-1",
  versionId: "version-1",
  templateAlias: "scaling-up",
  reportType: "INDIVIDUAL",
  approvalHash: "a".repeat(64),
  rendererContractVersion: 1,
  sourceCommit: "abc123",
  renderInputHash: "b".repeat(64),
};

const listRow = {
  id: "intent-1",
  version: 4,
  submissionId: "submission-1",
  campaignId: "campaign-1",
  recipientRole: "RESPONDENT",
  emailType: "ASSESSMENT_RESULTS",
  maskedRecipient: "p***@example.com",
  holdReason: "CURRENT_FACTS_DRIFTED",
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  heldAt: new Date("2026-08-01T11:00:00.000Z"),
  expiresAt: new Date("2026-08-31T10:00:00.000Z"),
  contentProvenance: provenance,
};

const detailResult = {
  id: "intent-1",
  submissionId: "submission-1",
  campaignId: "campaign-1",
  invitationId: "invitation-1",
  respondentId: "respondent-1",
  recipientRole: "RESPONDENT",
  emailType: "ASSESSMENT_RESULTS",
  recipientEmail: "person@example.com",
  subject: "Private subject",
  bodyHtml: "<p>Private body</p>",
  payloadHash: "c".repeat(64),
  snapshotSchemaVersion: 1,
  rendererContractVersion: 1,
  authorizationSnapshot: { private: "facts" },
  contentProvenance: provenance,
  status: "HELD" as const,
  version: 4,
  holdReason: "CURRENT_FACTS_DRIFTED",
  holdReasons: ["CURRENT_FACTS_DRIFTED"],
  heldAt: new Date("2026-08-01T11:00:00.000Z"),
  expiresAt: new Date("2026-08-31T10:00:00.000Z"),
  current: { current: "facts" },
  drift: { decision: "HOLD" },
  reviewContextHash: "d".repeat(64),
  reviewToken: "opaque-review-token",
};

const releaseResult = {
  intentId: "intent-1",
  status: "HANDED_OFF" as const,
  version: 5,
  outboxId: "outbox-1",
  existingOutboxWon: false,
};

const cancelResult = {
  intentId: "intent-1",
  status: "CANCELLED" as const,
  version: 5,
  outboxId: null,
  existingOutboxWon: false,
};

function request(
  path: string,
  method = "GET",
  body?: unknown,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function listRequest(query = ""): Request {
  return request(`/api/admin/assessment-email-delivery-intents${query}`);
}

function detailRequest(): Request {
  return request("/api/admin/assessment-email-delivery-intents/intent-1");
}

function releaseRequest(body: unknown = {
  expectedVersion: 4,
  reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
  reviewToken: "opaque-review-token",
}): Request {
  return request(
    "/api/admin/assessment-email-delivery-intents/intent-1/release",
    "POST",
    body,
  );
}

function cancelRequest(body: unknown = {
  expectedVersion: 4,
  reasonCode: "POLICY_DECISION",
}): Request {
  return request(
    "/api/admin/assessment-email-delivery-intents/intent-1/cancel",
    "POST",
    body,
  );
}

type HandlerCase = {
  name: string;
  invoke: () => Promise<Response>;
  service: jest.Mock;
};

function assertPrivate(response: Response): void {
  for (const [name, value] of Object.entries(privacyHeaders)) {
    expect(response.headers.get(name)).toBe(value);
  }
}

function opaqueCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

beforeEach(() => {
  jest.clearAllMocks();
  (withRateLimit as jest.Mock).mockResolvedValue({
    allowed: true,
    headers: { "X-RateLimit-Remaining": "9" },
  });
  (getApiActor as jest.Mock).mockResolvedValue(ADMIN);
  (db.$queryRaw as jest.Mock).mockResolvedValue([listRow]);
  (loadHeldIntentDetail as jest.Mock).mockResolvedValue(detailResult);
  (releaseHeldIntent as jest.Mock).mockResolvedValue(releaseResult);
  (cancelHeldIntent as jest.Mock).mockResolvedValue(cancelResult);
});

it("centralizes the security-sensitive route boundary in one non-route helper", () => {
  const routeRoot = resolve(
    process.cwd(),
    "src/app/api/admin/assessment-email-delivery-intents",
  );
  const support = readFileSync(resolve(routeRoot, "route-support.ts"), "utf8");
  expect(support).toContain("export function privateJson");
  expect(support).toContain("export async function requirePrivilegedActor");
  expect(support).toContain("export function operatorErrorResponse");

  for (const relativePath of [
    "route.ts",
    "[id]/route.ts",
    "[id]/release/route.ts",
    "[id]/cancel/route.ts",
  ]) {
    const source = readFileSync(resolve(routeRoot, relativePath), "utf8");
    expect(source).toContain(
      'from "@/app/api/admin/assessment-email-delivery-intents/route-support"',
    );
    expect(source).not.toMatch(
      /function (?:privateJson|requirePrivilegedActor|operatorErrorStatus|operatorErrorResponse)\b/,
    );
  }
});

it("keeps every App Router module export surface supported", () => {
  expect(Object.keys(listRouteModule).sort()).toEqual(["GET", "dynamic"]);
  expect(Object.keys(detailRouteModule).sort()).toEqual(["GET"]);
  expect(Object.keys(releaseRouteModule).sort()).toEqual(["POST"]);
  expect(Object.keys(cancelRouteModule).sort()).toEqual(["POST"]);
});

const handlerCases: HandlerCase[] = [
  {
    name: "list",
    invoke: () => listHeldIntents(listRequest() as never),
    service: db.$queryRaw as jest.Mock,
  },
  {
    name: "detail",
    invoke: () => getHeldIntent(detailRequest() as never, params),
    service: loadHeldIntentDetail as jest.Mock,
  },
  {
    name: "release",
    invoke: () => releaseHeldIntentRoute(releaseRequest() as never, params),
    service: releaseHeldIntent as jest.Mock,
  },
  {
    name: "cancel",
    invoke: () => cancelHeldIntentRoute(cancelRequest() as never, params),
    service: cancelHeldIntent as jest.Mock,
  },
];

describe.each(handlerCases)("$name route guard matrix", ({ invoke, service }) => {
  it("runs the standard rate limit before auth and returns a private 429", async () => {
    (withRateLimit as jest.Mock).mockResolvedValueOnce({
      allowed: false,
      headers: { "Retry-After": "10" },
    });

    const response = await invoke();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("10");
    assertPrivate(response);
    expect(withRateLimit).toHaveBeenCalledWith(expect.any(Request), RateLimits.standard);
    expect(getApiActor).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });

  it("returns a private 401 for an unauthenticated request", async () => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(null);

    const response = await invoke();

    expect(response.status).toBe(401);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(service).not.toHaveBeenCalled();
  });

  it("returns a private 403 for a Coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(COACH);

    const response = await invoke();

    expect(response.status).toBe(403);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "FORBIDDEN" });
    expect(service).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/assessment-email-delivery-intents", () => {
  it.each([ADMIN, STAFF])("allows privileged role $role and returns only narrow fields", async (actor) => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(actor);

    const response = await listHeldIntents(listRequest() as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(body).toEqual({
      data: [{
        id: "intent-1",
        version: 4,
        submissionId: "submission-1",
        campaignId: "campaign-1",
        recipientRole: "RESPONDENT",
        emailType: "ASSESSMENT_RESULTS",
        maskedRecipient: "p***@example.com",
        holdReason: "CURRENT_FACTS_DRIFTED",
        createdAt: "2026-08-01T10:00:00.000Z",
        heldAt: "2026-08-01T11:00:00.000Z",
        expiresAt: "2026-08-31T10:00:00.000Z",
        provenance: {
          templateId: "template-1",
          versionId: "version-1",
          templateAlias: "scaling-up",
          reportType: "INDIVIDUAL",
          rendererContractVersion: 1,
        },
      }],
      nextCursor: null,
    });
    expect(JSON.stringify(body)).not.toContain("person@example.com");
    expect(JSON.stringify(body)).not.toContain("approvalHash");
    expect(JSON.stringify(body)).not.toContain("sourceCommit");
    expect(JSON.stringify(body)).not.toContain("renderInputHash");
  });

  it("uses HELD-only parameterized SQL, the exact masked CASE, narrow selection, and limit + 1", async () => {
    await listHeldIntents(listRequest("?status=HELD&limit=2") as never);

    const sql = (db.$queryRaw as jest.Mock).mock.calls[0][0] as {
      text: string;
      values: unknown[];
    };
    const normalized = sql.text.replace(/\s+/g, " ");
    expect(normalized).toContain(
      `CASE WHEN POSITION('@' IN "recipientEmail") > 1 THEN LEFT("recipientEmail", 1) || '***@' || SPLIT_PART("recipientEmail", '@', 2) ELSE '***' END AS "maskedRecipient"`,
    );
    expect(normalized).toContain(`WHERE "status" = 'HELD'`);
    expect(normalized).toContain(`ORDER BY "heldAt" ASC, "createdAt" ASC, "id" ASC`);
    expect(normalized).toContain("LIMIT $1");
    expect(sql.values).toEqual([3]);
    expect(normalized).not.toMatch(
      /(?:SELECT|,)\s*"recipientEmail"\s*(?:,|FROM)/,
    );
    for (const forbidden of [
      "subject",
      "bodyHtml",
      "authorizationSnapshot",
      "payloadHash",
      "holdReasons",
    ]) {
      expect(normalized).not.toContain(`"${forbidden}"`);
    }
  });

  it("defaults limit reasonably, fetches one extra row, and encodes the last returned keyset", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      ...listRow,
      id: `intent-${String(index).padStart(2, "0")}`,
      createdAt: new Date(`2026-08-01T10:${String(index).padStart(2, "0")}:00.000Z`),
      heldAt: new Date(`2026-08-01T11:${String(index).padStart(2, "0")}:00.000Z`),
    }));
    (db.$queryRaw as jest.Mock).mockResolvedValueOnce(rows);

    const response = await listHeldIntents(listRequest() as never);
    const body = await response.json();
    const sql = (db.$queryRaw as jest.Mock).mock.calls[0][0] as { values: unknown[] };

    expect(sql.values).toEqual([26]);
    expect(body.data).toHaveLength(25);
    expect(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString("utf8"))).toEqual({
      heldAt: "2026-08-01T11:24:00.000Z",
      createdAt: "2026-08-01T10:24:00.000Z",
      id: "intent-24",
    });
  });

  it("decodes an exact opaque cursor and applies a parameterized matching keyset predicate", async () => {
    const cursor = opaqueCursor({
      heldAt: "2026-08-01T11:00:00.000Z",
      createdAt: "2026-08-01T10:00:00.000Z",
      id: "intent-secret-cursor",
    });

    await listHeldIntents(listRequest(`?cursor=${cursor}&limit=4`) as never);

    const sql = (db.$queryRaw as jest.Mock).mock.calls[0][0] as {
      text: string;
      values: unknown[];
    };
    const normalized = sql.text.replace(/\s+/g, " ");
    expect(normalized).toMatch(
      /\(\s*"heldAt" > \$1\s+OR \(\s*"heldAt" = \$2\s+AND "createdAt" > \$3\s*\)\s+OR \(\s*"heldAt" = \$4\s+AND "createdAt" = \$5\s+AND "id" > \$6\s*\)\s*\)/,
    );
    expect(sql.values).toEqual([
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T10:00:00.000Z"),
      new Date("2026-08-01T11:00:00.000Z"),
      new Date("2026-08-01T10:00:00.000Z"),
      "intent-secret-cursor",
      5,
    ]);
    expect(normalized).not.toContain("intent-secret-cursor");
  });

  it.each([
    "?limit=0",
    "?limit=51",
    "?limit=2.5",
    "?limit=two",
    "?status=PENDING",
    "?extra=value",
    "?cursor=not-json",
    `?cursor=${opaqueCursor({ heldAt: "no", createdAt: "2026-08-01T10:00:00.000Z", id: "i" })}`,
    `?cursor=${opaqueCursor({ heldAt: "2026-08-01T11:00:00.000Z", createdAt: "2026-08-01T10:00:00.000Z", id: "i", extra: true })}`,
  ])("rejects strict invalid query %s without querying", async (query) => {
    const response = await listHeldIntents(listRequest(query) as never);

    expect(response.status).toBe(400);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns a private stable 500 without logging or leaking a raw list error", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    (db.$queryRaw as jest.Mock).mockRejectedValueOnce(
      new Error("person@example.com Private subject <p>Private body</p>"),
    );

    const response = await listHeldIntents(listRequest() as never);
    const text = await response.text();

    expect(response.status).toBe(500);
    assertPrivate(response);
    expect(JSON.parse(text)).toEqual({ error: "INTERNAL_ERROR" });
    expect(text).not.toContain("person@example.com");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("GET /api/admin/assessment-email-delivery-intents/:id", () => {
  it.each([ADMIN, STAFF])("allows privileged role $role, passes only userId, and strips bodyHtml", async (actor) => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(actor);

    const response = await getHeldIntent(detailRequest() as never, params);
    const body = await response.json();

    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(loadHeldIntentDetail).toHaveBeenCalledWith(operatorDeps, {
      intentId: "intent-1",
      actor: { userId: actor.userId },
    });
    expect(productionAssessmentEmailIntentOperatorDeps).toHaveBeenCalledWith({
      reviewTokenSecret: process.env.ASSESSMENT_EMAIL_INTENT_REVIEW_TOKEN_SECRET,
    });
    expect(body.data).not.toHaveProperty("bodyHtml");
    expect(JSON.stringify(body)).not.toContain("<p>Private body</p>");
  });
});

describe("POST /api/admin/assessment-email-delivery-intents/:id/release", () => {
  it.each([ADMIN, STAFF])("allows privileged role $role and passes only validated fields plus userId", async (actor) => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(actor);

    const response = await releaseHeldIntentRoute(releaseRequest() as never, params);

    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(await response.json()).toEqual({ data: releaseResult });
    expect(releaseHeldIntent).toHaveBeenCalledWith(operatorDeps, {
      intentId: "intent-1",
      actor: { userId: actor.userId },
      expectedVersion: 4,
      reasonCode: "DRIFT_REVIEWED_SEND_FROZEN",
      reviewToken: "opaque-review-token",
    });
  });

  it.each([
    {},
    { expectedVersion: 4.5, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token" },
    { expectedVersion: 4, reasonCode: "SEND_ANYWAY", reviewToken: "token" },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "" },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token", recipient: "other@example.com" },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token", subject: "edited" },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token", bodyHtml: "<p>edit</p>" },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token", edits: {} },
    { expectedVersion: 4, reasonCode: "DRIFT_REVIEWED_SEND_FROZEN", reviewToken: "token", note: "free text" },
  ])("rejects an invalid or editable release body %#", async (body) => {
    const response = await releaseHeldIntentRoute(releaseRequest(body) as never, params);

    expect(response.status).toBe(400);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(releaseHeldIntent).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/assessment-email-delivery-intents/:id/cancel", () => {
  it.each([
    "DELIVERY_NO_LONGER_AUTHORIZED",
    "RECIPIENT_SUPERSEDED",
    "CAMPAIGN_RETIRED",
    "DUPLICATE_CONFIRMED",
    "POLICY_DECISION",
  ])("accepts the fixed cancellation reason %s", async (reasonCode) => {
    const response = await cancelHeldIntentRoute(
      cancelRequest({ expectedVersion: 4, reasonCode }) as never,
      params,
    );

    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(cancelHeldIntent).toHaveBeenCalledWith(operatorDeps, {
      intentId: "intent-1",
      actor: { userId: "admin-1" },
      expectedVersion: 4,
      reasonCode,
    });
  });

  it("allows STAFF and returns stable resolution data", async () => {
    (getApiActor as jest.Mock).mockResolvedValueOnce(STAFF);

    const response = await cancelHeldIntentRoute(cancelRequest() as never, params);

    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(await response.json()).toEqual({ data: cancelResult });
    expect(cancelHeldIntent).toHaveBeenCalledWith(
      operatorDeps,
      expect.objectContaining({ actor: { userId: "staff-1" } }),
    );
  });

  it.each([
    {},
    { expectedVersion: 4.5, reasonCode: "POLICY_DECISION" },
    { expectedVersion: 4, reasonCode: "OTHER" },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", reviewToken: "not-allowed" },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", recipient: "other@example.com" },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", subject: "edited" },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", bodyHtml: "<p>edit</p>" },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", edits: {} },
    { expectedVersion: 4, reasonCode: "POLICY_DECISION", note: "free text" },
  ])("rejects an invalid, token-bearing, or editable cancel body %#", async (body) => {
    const response = await cancelHeldIntentRoute(cancelRequest(body) as never, params);

    expect(response.status).toBe(400);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(cancelHeldIntent).not.toHaveBeenCalled();
  });
});

describe("typed operator service error mapping", () => {
  const mappings: Array<[OperatorServiceErrorCode, number]> = [
    ["RELEASE_REASON_NOT_ALLOWED", 400],
    ["CANCELLATION_REASON_NOT_ALLOWED", 400],
    ["INTENT_NOT_FOUND", 404],
    ["INTENT_NOT_HELD", 409],
    ["VERSION_CONFLICT", 409],
    ["SNAPSHOT_UNSUPPORTED", 409],
    ["RENDERER_UNSUPPORTED", 409],
    ["PROVENANCE_INVALID", 409],
    ["PAYLOAD_INTEGRITY_FAILED", 409],
    ["OUTBOX_OWNERSHIP_CONFLICT", 409],
    ["REVIEW_TOKEN_INVALID", 409],
    ["REVIEW_TOKEN_ACTOR_MISMATCH", 409],
    ["REVIEW_TOKEN_INTENT_MISMATCH", 409],
    ["REVIEW_TOKEN_VERSION_MISMATCH", 409],
    ["REVIEW_CONTEXT_CHANGED", 409],
    ["INTENT_EXPIRED", 410],
    ["REVIEW_TOKEN_EXPIRED", 410],
    ["SENDS_PAUSED", 423],
    ["REVIEW_TOKEN_CONFIGURATION_INVALID", 500],
    ["AUDIT_FAILED", 500],
    ["TRANSACTION_FAILED", 500],
  ];

  it.each(mappings)("maps %s to %i using the stable code only", async (code, status) => {
    (releaseHeldIntent as jest.Mock).mockRejectedValueOnce(
      new OperatorServiceError(code),
    );

    const response = await releaseHeldIntentRoute(releaseRequest() as never, params);
    const body = await response.json();

    expect(response.status).toBe(status);
    assertPrivate(response);
    expect(body).toEqual({ error: code });
    expect(JSON.stringify(body)).not.toContain("message");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("returns no detail when required audit persistence fails", async () => {
    (loadHeldIntentDetail as jest.Mock).mockRejectedValueOnce(
      new OperatorServiceError("AUDIT_FAILED"),
    );

    const response = await getHeldIntent(detailRequest() as never, params);

    expect(response.status).toBe(500);
    assertPrivate(response);
    expect(await response.json()).toEqual({ error: "AUDIT_FAILED" });
  });

  it.each([
    {
      name: "detail",
      setFailure: () => (loadHeldIntentDetail as jest.Mock).mockRejectedValueOnce(
        new Error("person@example.com <p>private detail</p>"),
      ),
      invoke: () => getHeldIntent(detailRequest() as never, params),
    },
    {
      name: "release",
      setFailure: () => (releaseHeldIntent as jest.Mock).mockRejectedValueOnce(
        new Error("person@example.com <p>private release</p>"),
      ),
      invoke: () => releaseHeldIntentRoute(releaseRequest() as never, params),
    },
    {
      name: "cancel",
      setFailure: () => (cancelHeldIntent as jest.Mock).mockRejectedValueOnce(
        new Error("person@example.com <p>private cancel</p>"),
      ),
      invoke: () => cancelHeldIntentRoute(cancelRequest() as never, params),
    },
  ])("does not log or expose a raw $name service error", async ({ setFailure, invoke }) => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    setFailure();

    const response = await invoke();
    const text = await response.text();

    expect(response.status).toBe(500);
    assertPrivate(response);
    expect(JSON.parse(text)).toEqual({ error: "INTERNAL_ERROR" });
    expect(text).not.toContain("person@example.com");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
