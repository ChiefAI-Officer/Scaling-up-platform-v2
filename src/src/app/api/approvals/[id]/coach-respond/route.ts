import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCoach } from "@/lib/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const coachRespondSchema = z.object({
  response: z.string().trim().min(1, "Response is required").max(2000),
});

// MR-33: Coach submits a response to an INFO_REQUESTED approval
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimit = await withRateLimit(request, RateLimits.standard);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    const { coach } = await requireCoach();
    const { id: approvalId } = await params;

    const rawBody = await request.json().catch(() => ({}));
    const parsed = coachRespondSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Response text is required (max 2000 characters)" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const approval = await db.approvalQueue.findUnique({
      where: { id: approvalId },
      select: { id: true, coachId: true, status: true },
    });

    if (!approval) {
      return NextResponse.json(
        { success: false, error: "Approval not found" },
        { status: 404, headers: rateLimit.headers }
      );
    }

    // Only the owning coach may respond
    if (approval.coachId !== coach.id) {
      return NextResponse.json(
        { success: false, error: "Approval not found" },
        { status: 404, headers: rateLimit.headers }
      );
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "This approval is not awaiting a coach response" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    await db.approvalQueue.update({
      where: { id: approvalId },
      data: { coachResponse: parsed.data.response },
    });

    return NextResponse.json(
      { success: true, message: "Response submitted successfully" },
      { headers: rateLimit.headers }
    );
  } catch (error) {
    console.error("Error submitting coach response:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit response" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
