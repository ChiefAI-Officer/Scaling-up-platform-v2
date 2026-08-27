import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import { createSummaryArtifactStore } from "@/lib/assessments/summary-reports/artifact-store";
import {
  auditSummaryReportArtifactAccess,
  createPrismaSummaryReportReadDb,
  getAuthorizedSummaryReportArtifact,
  type SummaryReportArtifactMetadata,
} from "@/lib/assessments/summary-reports/read";

const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const UNAVAILABLE_COPY = "Summary report artifact is temporarily unavailable.";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function unavailable(): Response {
  return json({ error: UNAVAILABLE_COPY }, 503);
}

function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const candidate = error.constructor?.name;
  return typeof candidate === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(candidate)
    ? candidate
    : "Error";
}

function logArtifactFailure(input: {
  stage: "metadata" | "read" | "integrity" | "audit";
  reportId: string;
  sizeBytes?: number;
  error?: unknown;
}): void {
  try {
    console.error(
      JSON.stringify({
        event: "summary-report-artifact-failed",
        stage: input.stage,
        reportId: input.reportId,
        ...(input.sizeBytes === undefined
          ? {}
          : { sizeBytes: input.sizeBytes }),
        ...(input.error === undefined
          ? {}
          : { errorClass: errorClass(input.error) }),
      }),
    );
  } catch {
    // Observability must not change the fail-closed response.
  }
}

function parseDisposition(request: Request): "inline" | "attachment" | null {
  const entries = [...new URL(request.url).searchParams.entries()];
  if (entries.length === 0) return "inline";
  if (entries.length !== 1 || entries[0][0] !== "disposition") return null;
  return entries[0][1] === "inline" || entries[0][1] === "attachment"
    ? entries[0][1]
    : null;
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "summary-report"
  );
}

function filenameFor(artifact: SummaryReportArtifactMetadata): string {
  const date = artifact.createdAt.toISOString().slice(0, 10);
  return `${slug(artifact.name)}-scaling-ceo-full-${date}.pdf`;
}

async function readVerifiedArtifact(
  stream: ReadableStream<Uint8Array>,
  metadata: SummaryReportArtifactMetadata,
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let sizeBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (sizeBytes + value.byteLength > MAX_ARTIFACT_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      const chunk = Buffer.from(value);
      sizeBytes += chunk.byteLength;
      hash.update(chunk);
      chunks.push(chunk);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  if (
    sizeBytes !== metadata.artifactSizeBytes ||
    hash.digest("hex") !== metadata.artifactSha256
  ) {
    return null;
  }
  return Buffer.concat(chunks, sizeBytes);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> },
): Promise<Response> {
  const { id: campaignId, reportId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  const actor = await getApiActor();
  if (!actor || !state.enabled || state.killed) return notFound();

  const disposition = parseDisposition(request);
  if (!disposition) return json({ error: "Invalid query." }, 400);

  const readDb = createPrismaSummaryReportReadDb(db);
  let result: Awaited<ReturnType<typeof getAuthorizedSummaryReportArtifact>>;
  try {
    result = await getAuthorizedSummaryReportArtifact(readDb, actor, {
      campaignId,
      reportId,
    });
  } catch (error) {
    logArtifactFailure({ stage: "metadata", reportId, error });
    return unavailable();
  }
  if (result.kind === "not-found") return notFound();

  const metadata = result.artifact;
  if (
    metadata.artifactSizeBytes < 0 ||
    metadata.artifactSizeBytes > MAX_ARTIFACT_BYTES
  ) {
    logArtifactFailure({
      stage: "integrity",
      reportId,
      sizeBytes: metadata.artifactSizeBytes,
    });
    return unavailable();
  }

  let stored: Awaited<
    ReturnType<ReturnType<typeof createSummaryArtifactStore>["getPdf"]>
  >;
  try {
    stored = await createSummaryArtifactStore().getPdf(metadata.artifactPath);
  } catch (error) {
    logArtifactFailure({ stage: "read", reportId, error });
    return unavailable();
  }
  if (!stored) {
    logArtifactFailure({ stage: "read", reportId });
    return unavailable();
  }

  let bytes: Buffer | null;
  try {
    bytes = await readVerifiedArtifact(stored.stream, metadata);
  } catch (error) {
    logArtifactFailure({ stage: "read", reportId, error });
    return unavailable();
  }
  if (!bytes) {
    logArtifactFailure({
      stage: "integrity",
      reportId,
      sizeBytes: metadata.artifactSizeBytes,
    });
    return unavailable();
  }

  const action =
    disposition === "attachment"
      ? "SUMMARY_REPORT_DOWNLOAD"
      : "SUMMARY_REPORT_VIEW";
  try {
    await auditSummaryReportArtifactAccess(readDb, actor, metadata, action);
  } catch (error) {
    logArtifactFailure({ stage: "audit", reportId, error });
    return unavailable();
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filenameFor(metadata)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
