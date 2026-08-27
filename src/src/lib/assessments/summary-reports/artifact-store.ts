import { createHash } from "crypto";
import { del, get, put } from "@vercel/blob";

export interface StoredSummaryArtifact {
  path: string;
  sha256: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface SummaryArtifactStore {
  putPdf(input: {
    campaignId: string;
    creationRequestId: string;
    bytes: Buffer;
    createdAt: Date;
  }): Promise<StoredSummaryArtifact>;
  getPdf(path: string): Promise<{
    stream: ReadableStream<Uint8Array>;
    etag: string | null;
  } | null>;
  delete(path: string): Promise<void>;
}

function getSummaryReportBlobToken(): string {
  const token = process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("Summary report blob storage is not configured");
  }
  return token;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "unknown";
}

function pathnameFor(input: {
  campaignId: string;
  creationRequestId: string;
}): string {
  return `summary-reports/${sanitizePathSegment(input.campaignId)}/${sanitizePathSegment(input.creationRequestId)}.pdf`;
}

export function createSummaryArtifactStore(): SummaryArtifactStore {
  return {
    async putPdf(input) {
      const token = getSummaryReportBlobToken();
      const blob = await put(pathnameFor(input), input.bytes, {
        access: "private",
        token,
        contentType: "application/pdf",
        addRandomSuffix: true,
      });

      return {
        path: blob.pathname,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        sizeBytes: input.bytes.byteLength,
        createdAt: input.createdAt,
      };
    },

    async getPdf(path) {
      const token = getSummaryReportBlobToken();
      const result = await get(path, { access: "private", token });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return null;
      }

      return {
        stream: result.stream,
        etag: result.blob.etag ?? null,
      };
    },

    async delete(path) {
      const token = process.env.SUMMARY_REPORT_BLOB_READ_WRITE_TOKEN?.trim();
      if (!token) return;

      try {
        await del(path, { token });
      } catch {
        // Cleanup is best-effort: a missing or already-deleted artifact is safe.
      }
    },
  };
}
