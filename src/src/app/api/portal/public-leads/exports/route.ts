import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";
import { inngest } from "@/inngest/client";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const ExportFilterSchema = z.object({
  search: z.string().trim().max(320).optional().default(""),
  assessment: z.string().trim().max(200).optional().default(""),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function boundary(value: string | undefined, end: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

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
  const parsed = ExportFilterSchema.safeParse(
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
  const search = filter.search.toLowerCase();
  const from = boundary(filter.from, false);
  const to = boundary(filter.to, true);

  const exportId = await db.$transaction(async (tx) => {
    const submissions = await tx.assessmentSubmission.findMany({
      where: {
        referringCoachId: actor.coachId,
        publicLeadDeletedAt: null,
        respondentId: null,
        campaign: {
          deletedAt: null,
          ...(filter.assessment
            ? { templateId: filter.assessment }
            : {}),
        },
        ...(from || to
          ? {
              submittedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lt: to } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { publicTakerNameNormalized: { startsWith: search } },
                { publicTakerEmailNormalized: { startsWith: search } },
              ],
            }
          : {}),
      },
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
