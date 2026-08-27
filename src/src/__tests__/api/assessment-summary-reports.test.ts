import { createHash } from "crypto";
import { ReadableStream as NodeReadableStream } from "stream/web";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ApiActor } from "@/lib/auth/access-control";

jest.mock("@/lib/db", () => ({ db: {} }));
jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/flags", () => ({
  resolveSummaryReportingState: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/read", () => ({
  createPrismaSummaryReportReadDb: jest.fn(() => ({ tag: "read-db" })),
  listAuthorizedSummaryReports: jest.fn(),
  getAuthorizedSummaryReportArtifact: jest.fn(),
  auditSummaryReportArtifactAccess: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/candidates", () => ({
  createPrismaSummaryReportCandidateDb: jest.fn(() => ({
    tag: "candidate-db",
  })),
  listSummaryReportCandidates: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/create", () => ({
  createPrismaSummaryReportCreateDb: jest.fn(() => ({ tag: "create-db" })),
  createSummaryReport: jest.fn(),
}));
jest.mock("@/lib/assessments/summary-reports/artifact-store", () => ({
  createSummaryArtifactStore: jest.fn(),
}));

import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import {
  auditSummaryReportArtifactAccess,
  getAuthorizedSummaryReportArtifact,
  listAuthorizedSummaryReports,
  type SummaryReportReadDb,
} from "@/lib/assessments/summary-reports/read";
import {
  createPrismaSummaryReportCandidateDb,
  listSummaryReportCandidates,
  type SummaryReportCandidateDb,
} from "@/lib/assessments/summary-reports/candidates";
import { createSummaryReport } from "@/lib/assessments/summary-reports/create";
import { createSummaryArtifactStore } from "@/lib/assessments/summary-reports/artifact-store";
import {
  GET as listReports,
  POST as createReport,
} from "@/app/api/assessment-campaigns/[id]/summary-reports/route";
import { GET as listCandidates } from "@/app/api/assessment-campaigns/[id]/summary-reports/candidates/route";
import { GET as getArtifact } from "@/app/api/assessment-campaigns/[id]/summary-reports/[reportId]/artifact/route";

const actualRead = jest.requireActual<
  typeof import("@/lib/assessments/summary-reports/read")
>("@/lib/assessments/summary-reports/read");

const actor: ApiActor = {
  userId: "user-1",
  email: "coach@example.com",
  role: "COACH",
  coachId: "coach-1",
};
const candidateAdapterContract: (
  client: PrismaClient,
) => SummaryReportCandidateDb = createPrismaSummaryReportCandidateDb;
void candidateAdapterContract;
const campaignId = "campaign-1";
const reportId = "report-1";
const requestId = "11111111-1111-4111-8111-111111111111";

function campaignParams(id = campaignId) {
  return { params: Promise.resolve({ id }) };
}

function artifactParams(id = campaignId, summaryReportId = reportId) {
  return { params: Promise.resolve({ id, reportId: summaryReportId }) };
}

function request(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

function header(response: Response, name: string): string | null {
  const headers = response.headers as unknown as Map<string, string>;
  return (
    headers.get(name) ??
    headers.get(name.toLowerCase()) ??
    headers.get(
      name
        .split("-")
        .map((part) =>
          part.length === 0
            ? part
            : `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`,
        )
        .join("-"),
    ) ??
    null
  );
}

function responseBytes(response: Response): Uint8Array {
  return new Uint8Array((response as unknown as { _body: Uint8Array })._body);
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new NodeReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }) as ReadableStream<Uint8Array>;
}

function artifactMetadata(bytes: Uint8Array) {
  return {
    id: reportId,
    campaignId,
    reportType: "SCALING_CEO_FULL" as const,
    name: 'Acme / Q3 "Plan"',
    createdAt: new Date("2026-08-27T04:30:00.000Z"),
    inputHash: "input-sha",
    artifactPath: `summary-reports/campaign-1/${requestId}-${"a".repeat(30)}.pdf`,
    artifactSha256: createHash("sha256").update(bytes).digest("hex"),
    artifactSizeBytes: bytes.byteLength,
  };
}

describe("campaign Summary Report APIs", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    (getApiActor as jest.Mock).mockResolvedValue(actor);
    (resolveSummaryReportingState as jest.Mock).mockReturnValue({
      enabled: true,
      killed: false,
    });
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe("common dark-launch and concealment gate", () => {
    const calls = [
      {
        name: "list",
        invoke: () =>
          listReports(
            request(
              `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
            ),
            campaignParams(),
          ),
        protectedCall: listAuthorizedSummaryReports,
      },
      {
        name: "candidates",
        invoke: () =>
          listCandidates(
            request(
              `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/candidates?type=SCALING_CEO_FULL&scope=current`,
            ),
            campaignParams(),
          ),
        protectedCall: listSummaryReportCandidates,
      },
      {
        name: "create",
        invoke: () =>
          createReport(
            request(
              `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  reportType: "SCALING_CEO_FULL",
                  creationRequestId: requestId,
                  sources: [],
                }),
              },
            ),
            campaignParams(),
          ),
        protectedCall: createSummaryReport,
      },
      {
        name: "artifact",
        invoke: () =>
          getArtifact(
            request(
              `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
            ),
            artifactParams(),
          ),
        protectedCall: getAuthorizedSummaryReportArtifact,
      },
    ];

    it.each(calls)(
      "returns the same 404 for unauthenticated $name",
      async ({ invoke, protectedCall }) => {
        (getApiActor as jest.Mock).mockResolvedValue(null);

        const response = await invoke();

        expect(response.status).toBe(404);
        expect(await json(response)).toEqual({ error: "Not found" });
        expect(protectedCall).not.toHaveBeenCalled();
        expect(resolveSummaryReportingState).toHaveBeenCalledWith(
          process.env,
          campaignId,
        );
      },
    );

    it.each(calls)(
      "returns concealed 404 before protected access when $name is flag-off",
      async ({ invoke, protectedCall }) => {
        (resolveSummaryReportingState as jest.Mock).mockReturnValue({
          enabled: false,
          killed: false,
        });

        const response = await invoke();

        expect(response.status).toBe(404);
        expect(await json(response)).toEqual({ error: "Not found" });
        expect(protectedCall).not.toHaveBeenCalled();
      },
    );

    it.each(calls)(
      "returns concealed 404 before protected access when $name is killed",
      async ({ invoke, protectedCall }) => {
        (resolveSummaryReportingState as jest.Mock).mockReturnValue({
          enabled: false,
          killed: true,
        });

        const response = await invoke();

        expect(response.status).toBe(404);
        expect(await json(response)).toEqual({ error: "Not found" });
        expect(protectedCall).not.toHaveBeenCalled();
      },
    );
  });

  it("lists only authorized campaign reports in newest-first order", async () => {
    (listAuthorizedSummaryReports as jest.Mock).mockResolvedValue({
      kind: "ok",
      reports: [
        {
          id: "new",
          campaignId,
          reportType: "SCALING_CEO_FULL",
          name: "Campaign 1",
          createdByEmailSnapshot: "admin@example.com",
          createdAt: "2026-08-27T04:30:00.000Z",
        },
        {
          id: "old",
          campaignId,
          reportType: "SCALING_CEO_FULL",
          name: "Campaign 1",
          createdByEmailSnapshot: "admin@example.com",
          createdAt: "2026-08-26T04:30:00.000Z",
        },
      ],
    });

    const response = await listReports(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
      ),
      campaignParams(),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      reports: [{ id: "new" }, { id: "old" }],
    });
    expect(listAuthorizedSummaryReports).toHaveBeenCalledWith(
      { tag: "read-db" },
      actor,
      campaignId,
    );
  });

  it("conceals an unauthorized report list", async () => {
    (listAuthorizedSummaryReports as jest.Mock).mockResolvedValue({
      kind: "not-found",
    });

    const response = await listReports(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
      ),
      campaignParams(),
    );

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Not found" });
  });

  it("accepts only the implemented candidate type and current/all scope", async () => {
    (listSummaryReportCandidates as jest.Mock).mockResolvedValue({
      kind: "ok",
      candidates: [{ submissionId: "submission-1" }],
    });
    const response = await listCandidates(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/candidates?type=SCALING_CEO_FULL&scope=all`,
      ),
      campaignParams(),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      candidates: [{ submissionId: "submission-1" }],
    });
    expect(listSummaryReportCandidates).toHaveBeenCalledWith(
      { tag: "candidate-db" },
      actor,
      {
        destinationCampaignId: campaignId,
        reportType: "SCALING_CEO_FULL",
        scope: "all",
      },
    );

    for (const query of [
      "type=SCALING_CONDENSED_CEO&scope=current",
      "type=SCALING_CEO_FULL&scope=somewhere",
      "type=SCALING_CEO_FULL&scope=current&actor=user-2",
    ]) {
      jest.clearAllMocks();
      (getApiActor as jest.Mock).mockResolvedValue(actor);
      (resolveSummaryReportingState as jest.Mock).mockReturnValue({
        enabled: true,
        killed: false,
      });
      const invalid = await listCandidates(
        request(
          `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/candidates?${query}`,
        ),
        campaignParams(),
      );
      expect(invalid.status).toBe(400);
      expect(listSummaryReportCandidates).not.toHaveBeenCalled();
    }
  });

  it("conceals candidate and create domain authorization failures", async () => {
    (listSummaryReportCandidates as jest.Mock).mockResolvedValue({
      kind: "not-found",
    });
    const candidates = await listCandidates(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/candidates?type=SCALING_CEO_FULL&scope=current`,
      ),
      campaignParams(),
    );
    expect(candidates.status).toBe(404);
    expect(await json(candidates)).toEqual({ error: "Not found" });

    (createSummaryReport as jest.Mock).mockResolvedValue({ kind: "not-found" });
    const creation = await createReport(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reportType: "SCALING_CEO_FULL",
            creationRequestId: requestId,
            sources: [],
          }),
        },
      ),
      campaignParams(),
    );
    expect(creation.status).toBe(404);
    expect(await json(creation)).toEqual({ error: "Not found" });
  });

  it("returns 400 for malformed create JSON or client-controlled authority fields", async () => {
    const malformed = await createReport(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
        {
          method: "POST",
          body: "{",
        },
      ),
      campaignParams(),
    );
    expect(malformed.status).toBe(400);

    const injected = await createReport(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reportType: "SCALING_CEO_FULL",
            creationRequestId: requestId,
            sources: [],
            destinationCampaignId: "campaign-2",
            actor: { role: "ADMIN" },
            artifactPath: "public.pdf",
          }),
        },
      ),
      campaignParams(),
    );
    expect(injected.status).toBe(400);
    expect(createSummaryReport).not.toHaveBeenCalled();
  });

  it.each([
    [
      "invalid",
      422,
      { errors: [{ code: "missing_role", message: "Choose one CEO." }] },
    ],
    [
      "render-failed",
      503,
      { error: "Summary report could not be created. Try again." },
    ],
  ] as const)(
    "maps the %s creation result safely",
    async (kind, status, expected) => {
      (createSummaryReport as jest.Mock).mockResolvedValue(
        kind === "invalid" ? { kind, ...expected } : { kind },
      );

      const response = await createReport(
        request(
          `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              reportType: "SCALING_CEO_FULL",
              creationRequestId: requestId,
              sources: [],
            }),
          },
        ),
        campaignParams(),
      );

      expect(response.status).toBe(status);
      expect(await json(response)).toEqual(expected);
    },
  );

  it.each([
    ["created", 201],
    ["existing", 200],
  ] as const)("maps %s idempotency to HTTP %s", async (kind, status) => {
    (createSummaryReport as jest.Mock).mockResolvedValue({
      kind,
      report: { id: reportId, campaignId },
    });

    const response = await createReport(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reportType: "SCALING_CEO_FULL",
            creationRequestId: requestId,
            sources: [
              {
                submissionId: "submission-1",
                sourceCampaignId: "source-campaign",
                role: "CEO",
                position: 0,
              },
            ],
          }),
        },
      ),
      campaignParams(),
    );

    expect(response.status).toBe(status);
    expect(await json(response)).toEqual({
      report: { id: reportId, campaignId },
    });
    expect(createSummaryReport).toHaveBeenCalledWith(
      { tag: "create-db" },
      actor,
      {
        destinationCampaignId: campaignId,
        reportType: "SCALING_CEO_FULL",
        creationRequestId: requestId,
        sources: [
          {
            submissionId: "submission-1",
            sourceCampaignId: "source-campaign",
            role: "CEO",
            position: 0,
          },
        ],
      },
    );
  });

  it("constrains artifact lookup to both path campaign and report IDs", async () => {
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "not-found",
    });

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(404);
    expect(getAuthorizedSummaryReportArtifact).toHaveBeenCalledWith(
      { tag: "read-db" },
      actor,
      { campaignId, reportId },
    );
    expect(createSummaryArtifactStore).not.toHaveBeenCalled();
  });

  it.each([
    ["inline", "SUMMARY_REPORT_VIEW"],
    ["attachment", "SUMMARY_REPORT_DOWNLOAD"],
  ] as const)(
    "verifies then audits and serves %s PDF privately",
    async (disposition, auditAction) => {
      const bytes = Buffer.from("%PDF-1.7 verified artifact");
      const metadata = artifactMetadata(bytes);
      (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
        kind: "ok",
        artifact: metadata,
      });
      const store = {
        getPdf: jest.fn().mockResolvedValue({
          stream: streamOf(bytes.slice(0, 8), bytes.slice(8)),
          etag: "etag",
        }),
      };
      (createSummaryArtifactStore as jest.Mock).mockReturnValue(store);
      (auditSummaryReportArtifactAccess as jest.Mock).mockResolvedValue(
        undefined,
      );

      const response = await getArtifact(
        request(
          `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact?disposition=${disposition}`,
        ),
        artifactParams(),
      );

      expect(response.status).toBe(200);
      expect(header(response, "Content-Type")).toBe("application/pdf");
      expect(header(response, "Cache-Control")).toBe("private, no-store");
      expect(header(response, "X-Content-Type-Options")).toBe("nosniff");
      expect(header(response, "Content-Disposition")).toBe(
        `${disposition}; filename="acme-q3-plan-scaling-ceo-full-2026-08-27.pdf"`,
      );
      expect(responseBytes(response)).toEqual(bytes);
      expect(store.getPdf).toHaveBeenCalledWith(metadata.artifactPath);
      expect(auditSummaryReportArtifactAccess).toHaveBeenCalledWith(
        { tag: "read-db" },
        actor,
        metadata,
        auditAction,
      );
    },
  );

  it("fails closed with no artifact bytes or audit on checksum mismatch", async () => {
    const expected = Buffer.from("%PDF expected");
    const altered = Buffer.from("%PDF altered!");
    const metadata = artifactMetadata(expected);
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "ok",
      artifact: metadata,
    });
    (createSummaryArtifactStore as jest.Mock).mockReturnValue({
      getPdf: jest.fn().mockResolvedValue({
        stream: streamOf(altered),
        etag: null,
      }),
    });

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(503);
    expect(header(response, "Content-Type")).toContain("application/json");
    expect(await json(response)).toEqual({
      error: "Summary report artifact is temporarily unavailable.",
    });
    expect(auditSummaryReportArtifactAccess).not.toHaveBeenCalled();
    const operationalLog = JSON.parse(String(consoleError.mock.calls[0][0]));
    expect(operationalLog).toEqual({
      event: "summary-report-artifact-failed",
      stage: "integrity",
      reportId,
      sizeBytes: expected.byteLength,
    });
    expect(JSON.stringify(operationalLog)).not.toContain(campaignId);
    expect(JSON.stringify(operationalLog)).not.toContain(metadata.artifactPath);
    expect(JSON.stringify(operationalLog)).not.toContain(metadata.name);
  });

  it("fails closed before storage for metadata over 25 MiB", async () => {
    const metadata = {
      ...artifactMetadata(new Uint8Array()),
      artifactSizeBytes: 25 * 1024 * 1024 + 1,
    };
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "ok",
      artifact: metadata,
    });

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(503);
    expect(createSummaryArtifactStore).not.toHaveBeenCalled();
    expect(auditSummaryReportArtifactAccess).not.toHaveBeenCalled();
  });

  it("maps a private stream acquisition failure to safe 503 with no bytes", async () => {
    const bytes = Buffer.from("%PDF inaccessible");
    const metadata = artifactMetadata(bytes);
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "ok",
      artifact: metadata,
    });
    (createSummaryArtifactStore as jest.Mock).mockReturnValue({
      getPdf: jest.fn().mockResolvedValue({
        stream: {
          getReader() {
            const unsafeError = new Error(
              `locked stream ${metadata.artifactPath} for ${metadata.name}`,
            );
            unsafeError.name = metadata.artifactPath;
            throw unsafeError;
          },
        },
        etag: null,
      }),
    });

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "Summary report artifact is temporarily unavailable.",
    });
    expect(auditSummaryReportArtifactAccess).not.toHaveBeenCalled();
    const operationalLog = JSON.parse(String(consoleError.mock.calls[0][0]));
    expect(operationalLog).toEqual({
      event: "summary-report-artifact-failed",
      stage: "read",
      reportId,
      errorClass: "Error",
    });
    expect(JSON.stringify(operationalLog)).not.toContain(metadata.artifactPath);
    expect(JSON.stringify(operationalLog)).not.toContain(metadata.name);
  });

  it("stops an oversized stream before buffering or audit", async () => {
    const metadata = {
      ...artifactMetadata(Buffer.from("x")),
      artifactSizeBytes: 1,
    };
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "ok",
      artifact: metadata,
    });
    const cancel = jest.fn().mockResolvedValue(undefined);
    const releaseLock = jest.fn();
    const stream = {
      getReader: () => ({
        read: jest.fn().mockResolvedValueOnce({
          done: false,
          value: { byteLength: 25 * 1024 * 1024 + 1 },
        }),
        cancel,
        releaseLock,
      }),
    } as unknown as ReadableStream<Uint8Array>;
    (createSummaryArtifactStore as jest.Mock).mockReturnValue({
      getPdf: jest.fn().mockResolvedValue({ stream, etag: null }),
    });

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(auditSummaryReportArtifactAccess).not.toHaveBeenCalled();
  });

  it("fails closed before bytes when strict access audit cannot commit", async () => {
    const bytes = Buffer.from("%PDF verified");
    const metadata = artifactMetadata(bytes);
    (getAuthorizedSummaryReportArtifact as jest.Mock).mockResolvedValue({
      kind: "ok",
      artifact: metadata,
    });
    (createSummaryArtifactStore as jest.Mock).mockReturnValue({
      getPdf: jest
        .fn()
        .mockResolvedValue({ stream: streamOf(bytes), etag: null }),
    });
    (auditSummaryReportArtifactAccess as jest.Mock).mockRejectedValue(
      new Error("database unavailable"),
    );

    const response = await getArtifact(
      request(
        `http://localhost/api/assessment-campaigns/${campaignId}/summary-reports/${reportId}/artifact`,
      ),
      artifactParams(),
    );

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      error: "Summary report artifact is temporarily unavailable.",
    });
  });
});

function readDbHarness(
  input: {
    campaignExists?: boolean;
    reportRows?: Awaited<ReturnType<SummaryReportReadDb["findReports"]>>;
    artifact?: Awaited<ReturnType<SummaryReportReadDb["findArtifact"]>>;
  } = {},
) {
  const findReports = jest.fn(async () => input.reportRows ?? []);
  const findArtifact = jest.fn(async () => input.artifact ?? null);
  const createAudit: jest.MockedFunction<SummaryReportReadDb["createAudit"]> =
    jest.fn<Promise<void>, [Prisma.AuditLogUncheckedCreateInput]>(
      async () => undefined,
    );
  const db: SummaryReportReadDb = {
    accessDb: {
      accessGroupCoach: { findMany: jest.fn(async () => []) },
      accessGroupTemplate: { findMany: jest.fn(async () => []) },
      organization: { findUnique: jest.fn(async () => null) },
      coach: { findUnique: jest.fn(async () => null) },
      assessmentCampaign: {
        findFirst: jest.fn(async () =>
          input.campaignExists === false
            ? null
            : {
                id: campaignId,
                organizationId: "org-1",
                templateId: "template-1",
                createdByCoachId: null,
                status: "ACTIVE" as const,
                deletedAt: null,
              },
        ),
      },
    },
    findReports,
    findArtifact,
    createAudit,
  };
  return { db, findReports, findArtifact, createAudit };
}

describe("Summary Report authorized read boundary", () => {
  const admin: ApiActor = {
    userId: "admin-1",
    email: "admin@example.com",
    role: "ADMIN",
    coachId: null,
  };

  it("authorizes first, filters the path campaign, and returns newest-first DTOs", async () => {
    const old = new Date("2026-08-26T04:30:00.000Z");
    const newest = new Date("2026-08-27T04:30:00.000Z");
    const { db } = readDbHarness({
      reportRows: [
        {
          id: "old",
          campaignId,
          reportType: "SCALING_CEO_FULL",
          name: "Campaign 1",
          createdByEmailSnapshot: "admin@example.com",
          createdAt: old,
        },
        {
          id: "foreign",
          campaignId: "campaign-2",
          reportType: "SCALING_CEO_FULL",
          name: "Campaign 2",
          createdByEmailSnapshot: "admin@example.com",
          createdAt: new Date("2026-08-28T04:30:00.000Z"),
        },
        {
          id: "new",
          campaignId,
          reportType: "SCALING_CEO_FULL",
          name: "Campaign 1",
          createdByEmailSnapshot: "admin@example.com",
          createdAt: newest,
        },
      ],
    });

    const result = await actualRead.listAuthorizedSummaryReports(
      db,
      admin,
      campaignId,
    );

    expect(result).toEqual({
      kind: "ok",
      reports: [
        expect.objectContaining({
          id: "new",
          campaignId,
          createdAt: newest.toISOString(),
        }),
        expect.objectContaining({
          id: "old",
          campaignId,
          createdAt: old.toISOString(),
        }),
      ],
    });
  });

  it("does not query reports when destination authorization is unavailable", async () => {
    const { db, findReports } = readDbHarness({ campaignExists: false });

    const result = await actualRead.listAuthorizedSummaryReports(
      db,
      admin,
      campaignId,
    );

    expect(result).toEqual({ kind: "not-found" });
    expect(findReports).not.toHaveBeenCalled();
  });

  it("writes the strict artifact audit allowlist without path, name, or email", async () => {
    const bytes = Buffer.from("%PDF audit");
    const metadata = artifactMetadata(bytes);
    const { db, createAudit } = readDbHarness({ artifact: metadata });

    await actualRead.auditSummaryReportArtifactAccess(
      db,
      admin,
      metadata,
      "SUMMARY_REPORT_DOWNLOAD",
    );

    expect(createAudit).toHaveBeenCalledWith({
      entityType: "SummaryReport",
      entityId: reportId,
      action: "SUMMARY_REPORT_DOWNLOAD",
      performedBy: admin.userId,
      changes: JSON.stringify({
        reportId,
        campaignId,
        reportType: "SCALING_CEO_FULL",
        inputHash: "input-sha",
        artifactSha256: metadata.artifactSha256,
      }),
    });
    const serialized = JSON.stringify(createAudit.mock.calls[0][0]);
    expect(serialized).not.toContain(metadata.artifactPath);
    expect(serialized).not.toContain(metadata.name);
    expect(serialized).not.toContain(admin.email);
  });
});
