import { ReadableStream } from "node:stream/web";

jest.mock("@vercel/blob", () => ({
  put: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
}));

import { createSummaryArtifactStore } from "@/lib/assessments/summary-reports/artifact-store";

const {
  put: mockPut,
  get: mockGet,
  del: mockDel,
} = jest.requireMock("@vercel/blob") as {
  put: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

describe("summary report private artifact store", () => {
  const originalSummaryToken = process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN;
  const originalLegacyToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    mockPut.mockReset();
    mockGet.mockReset();
    mockDel.mockReset();
    process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN = "summary-report-token";
    process.env.BLOB_READ_WRITE_TOKEN = "legacy-token-that-must-never-be-used";
  });

  afterAll(() => {
    if (originalSummaryToken === undefined) {
      delete process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN = originalSummaryToken;
    }

    if (originalLegacyToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalLegacyToken;
    }
  });

  it("uploads a private PDF under a sanitized deterministic prefix and exposes only its pathname", async () => {
    const bytes = Buffer.from("frozen PDF bytes");
    const createdAt = new Date("2026-08-27T03:00:00.000Z");
    mockPut.mockResolvedValue({
      pathname: "summary-reports/Campaign-Team-Co/request-01-abc123.pdf",
      url: "https://public.example/never-expose-this",
      downloadUrl: "https://public.example/never-expose-this?download=1",
    });

    const result = await createSummaryArtifactStore().putPdf({
      campaignId: "Campaign / Team & Co.",
      creationRequestId: "request / 01",
      bytes,
      createdAt,
    });

    expect(mockPut).toHaveBeenCalledWith(
      "summary-reports/Campaign-Team-Co/request-01.pdf",
      bytes,
      {
        access: "private",
        token: "summary-report-token",
        contentType: "application/pdf",
        addRandomSuffix: true,
      },
    );
    expect(result).toEqual({
      path: "summary-reports/Campaign-Team-Co/request-01-abc123.pdf",
      sha256:
        "97557d339b80cdf69a99ce1d6804540af7450170c2c4798749dd3c321bfa6dbd",
      sizeBytes: bytes.byteLength,
      createdAt,
    });
    expect(result).not.toHaveProperty("url");
    expect(result).not.toHaveProperty("downloadUrl");
  });

  it("fails closed for writes when the dedicated summary-report token is absent", async () => {
    delete process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN;

    await expect(
      createSummaryArtifactStore().putPdf({
        campaignId: "campaign-1",
        creationRequestId: "request-1",
        bytes: Buffer.from("pdf"),
        createdAt: new Date("2026-08-27T03:00:00.000Z"),
      }),
    ).rejects.toThrow("Summary report blob storage is not configured");

    expect(mockPut).not.toHaveBeenCalled();
  });

  it("reads a private artifact with the dedicated token and returns the SDK stream unchanged", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream,
      headers: new Headers(),
      blob: { etag: "etag-123" },
    });

    const result = await createSummaryArtifactStore().getPdf(
      "summary-reports/campaign-1/request-1.pdf",
    );

    expect(mockGet).toHaveBeenCalledWith(
      "summary-reports/campaign-1/request-1.pdf",
      { access: "private", token: "summary-report-token" },
    );
    expect(result).toEqual({ stream, etag: "etag-123" });
    expect(result?.stream).toBe(stream);
  });

  it("returns null when a private artifact is unavailable", async () => {
    mockGet.mockResolvedValue(null);

    await expect(
      createSummaryArtifactStore().getPdf(
        "summary-reports/campaign-1/missing.pdf",
      ),
    ).resolves.toBeNull();
  });

  it("rejects malformed artifact paths before read or cleanup can reach Blob storage", async () => {
    const malformedPaths = [
      "https://store.example/summary-reports/campaign-1/request-1.pdf",
      "/summary-reports/campaign-1/request-1.pdf",
      "summary-reports/../request-1.pdf",
      "summary-reports/campaign-1/../request-1.pdf",
      "summary-reports\\campaign-1\\request-1.pdf",
      "summary-reports//request-1.pdf",
      "summary-reports/campaign-1/request-1.pdf?download=1",
      "summary-reports/campaign-1/request-1.pdf#fragment",
      "other-reports/campaign-1/request-1.pdf",
      "summary-reports/campaign-1/request-1/extra.pdf",
      "summary-reports/campaign-1/request-1.txt",
      "summary-reports/campaign.1/request-1.pdf",
    ];
    const store = createSummaryArtifactStore();

    for (const path of malformedPaths) {
      await expect(store.getPdf(path)).rejects.toThrow(
        "Invalid summary report artifact path",
      );
      await expect(store.delete(path)).rejects.toThrow(
        "Invalid summary report artifact path",
      );
    }

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("fails closed for reads when the dedicated summary-report token is absent", async () => {
    delete process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN;

    await expect(
      createSummaryArtifactStore().getPdf(
        "summary-reports/campaign-1/request-1.pdf",
      ),
    ).rejects.toThrow("Summary report blob storage is not configured");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("deletes with the dedicated token and swallows cleanup failures idempotently", async () => {
    mockDel.mockRejectedValueOnce(new Error("already missing"));

    const store = createSummaryArtifactStore();
    await expect(
      store.delete("summary-reports/campaign-1/request-1.pdf"),
    ).resolves.toBeUndefined();
    await expect(
      store.delete("summary-reports/campaign-1/request-1.pdf"),
    ).resolves.toBeUndefined();

    expect(mockDel).toHaveBeenNthCalledWith(
      1,
      "summary-reports/campaign-1/request-1.pdf",
      {
        token: "summary-report-token",
      },
    );
    expect(mockDel).toHaveBeenNthCalledWith(
      2,
      "summary-reports/campaign-1/request-1.pdf",
      {
        token: "summary-report-token",
      },
    );
  });

  it("does not attempt best-effort deletion without the dedicated token", async () => {
    delete process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN;

    await expect(
      createSummaryArtifactStore().delete(
        "summary-reports/campaign-1/request-1.pdf",
      ),
    ).resolves.toBeUndefined();
    expect(mockDel).not.toHaveBeenCalled();
  });
});
