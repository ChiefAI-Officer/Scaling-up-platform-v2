import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  publicLeadRetentionCutoff,
  resolvePublicLeadsState,
} from "@/lib/assessments/public-leads-state";
import { inngest } from "@/inngest/client";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import {
  buildPublicLeadSubmissionWhere,
  PublicLeadFilterSchema,
} from "@/lib/assessments/public-lead-filters";

export async function POST(request: NextRequest) {
  const rate = await withRateLimit(request, RateLimits.search);
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rate.headers },
    );
  }
  const actor = await getApiActor();
  if (!actor?.coachId) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  const parsed = PublicLeadFilterSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid filters" },
      { status: 400 },
    );
  }
  const state = resolvePublicLeadsState(process.env, {
    coachId: actor.coachId,
  });
  if (!state.presentationEnabled) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }

  const filter = parsed.data;
  const retentionCutoff = publicLeadRetentionCutoff(state);
  if (retentionCutoff === null) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 },
    );
  }
  const where = buildPublicLeadSubmissionWhere({
    coachId: actor.coachId,
    filter,
    retentionCutoff,
  });

  const exportId = await db.$transaction(async (tx) => {
    const submissions = await tx.assessmentSubmission.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const manifestDigest = createHash("sha256")
      .update(submissions.map((item) => item.id).join("\n"))
      .digest("hex");
    const job = await tx.publicLeadExport.create({
      data: {
        requestedByUserId: actor.userId,
        ownerCoachId: actor.coachId,
        filter,
        manifestDigest,
        manifestRowCount: submissions.length,
        emittedRowCount: 0,
        items: {
          create: submissions.map((submission, sortOrder) => ({
            submissionId: submission.id,
            sortOrder,
          })),
        },
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        entityType: "PublicLeadExport",
        entityId: job.id,
        action: "EXPORT",
        performedBy: actor.email,
        changes: JSON.stringify({
          kind: "public-lead-export-started",
          ownerCoachId: actor.coachId,
          filter,
          manifestDigest,
          manifestRowCount: submissions.length,
        }),
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      },
    });
    return job.id;
  });

  await inngest.send({
    name: "assessment/public-lead-export.requested",
    data: { exportId },
  });
  return NextResponse.json(
    { success: true, data: { exportId, status: "PENDING" } },
    { status: 202 },
  );
}
