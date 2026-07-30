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
  const eligibleCoach = await db.coach.count({
    where: {
      id: actor.coachId,
      deletedAt: null,
      certificationStatus: "ACTIVE",
      OR: [
        { certificationExpiry: null },
        { certificationExpiry: { gt: new Date() } },
      ],
    },
  });
  if (eligibleCoach !== 1) {
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
  if (!job) return new Response("Not found", { status: 404 });
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

  let after = -1;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await db.publicLeadExportChunk.findFirst({
        where: { exportId: job.id, batchIndex: { gt: after } },
        orderBy: { batchIndex: "asc" },
      });
      if (!chunk) {
        if (after === -1) {
          controller.enqueue(
            new TextEncoder().encode(
              '"Name","Email","Submitted at","Assessment"\r\n',
            ),
          );
        }
        controller.close();
        return;
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(chunk.nonce),
      );
      decipher.setAuthTag(Buffer.from(chunk.authTag));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(chunk.ciphertext)),
        decipher.final(),
      ]);
      after = chunk.batchIndex;
      controller.enqueue(new Uint8Array(plaintext));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="public-leads.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
