import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolvePublicLeadsState } from "@/lib/assessments/public-leads-state";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor();
  if (!actor?.coachId) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const state = resolvePublicLeadsState(process.env, { coachId: actor.coachId });
  if (!state.presentationEnabled) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const { id } = await params;
  const job = await db.publicLeadExport.findFirst({
    where: {
      id,
      requestedByUserId: actor.userId,
      ownerCoachId: actor.coachId,
    },
    select: {
      status: true,
      emittedRowCount: true,
      expiresAt: true,
    },
  });
  if (!job) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: {
      status: job.status,
      rowCount: job.emittedRowCount,
      downloadUrl:
        job.status === "COMPLETED"
          ? `/api/portal/public-leads/exports/${id}/download`
          : null,
      expiresAt: job.expiresAt,
    },
  });
}
