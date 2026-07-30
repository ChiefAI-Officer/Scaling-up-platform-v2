import { createDecipheriv } from "node:crypto";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor();
  if (!actor?.coachId) return new Response("Not found", { status: 404 });
  const state = resolvePublicLeadsState(process.env, { coachId: actor.coachId });
  if (!state.presentationEnabled) {
    return new Response("Not found", { status: 404 });
  }
  const { id } = await params;
  const job = await db.publicLeadExport.findFirst({
    where: {
      id,
      requestedByUserId: actor.userId,
      ownerCoachId: actor.coachId,
      status: "COMPLETED",
      expiresAt: { gt: new Date() },
    },
  });
  if (
    !job?.artifactCiphertext ||
    !job.artifactNonce ||
    !job.artifactAuthTag
  ) {
    return new Response("Not found", { status: 404 });
  }
  const expectedVersion =
    process.env.PUBLIC_LEADS_EXPORT_KEY_VERSION?.trim() || "v1";
  const key = Buffer.from(
    process.env.PUBLIC_LEADS_EXPORT_KEY?.trim() ?? "",
    "base64",
  );
  if (key.length !== 32 || job.artifactKeyVersion !== expectedVersion) {
    return new Response("Not found", { status: 404 });
  }

  // Fail closed: no bytes leave the server unless the download audit commits.
  await db.auditLog.create({
    data: {
      entityType: "PublicLeadExport",
      entityId: job.id,
      action: "EXPORT",
      performedBy: actor.email,
      changes: JSON.stringify({
        kind: "public-lead-export-downloaded",
        emittedDigest: job.emittedDigest,
        emittedRowCount: job.emittedRowCount,
      }),
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    },
  });

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(job.artifactNonce),
  );
  decipher.setAuthTag(Buffer.from(job.artifactAuthTag));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(job.artifactCiphertext)),
    decipher.final(),
  ]);
  return new Response(plaintext, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="public-leads.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
