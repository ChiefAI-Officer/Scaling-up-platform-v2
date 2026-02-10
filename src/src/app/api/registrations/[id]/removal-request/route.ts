import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const removalRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

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
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: rateLimit.headers }
      );
    }

    const { id: registrationId } = await params;
    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = removalRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const registration = await db.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        workshopId: true,
        workshop: {
          select: {
            id: true,
            title: true,
            coachId: true,
            eventDate: true,
          },
        },
      },
    });

    if (!registration) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404, headers: rateLimit.headers }
      );
    }

    if (!canManageCoachData(actor, registration.workshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Registration not found" },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const duplicateMarker = `"registrationId":"${registration.id}"`;
    const existingPending = await db.approvalQueue.findFirst({
      where: {
        coachId: registration.workshop.coachId,
        workshopId: registration.workshopId,
        type: "CANCELLATION",
        status: "PENDING",
        requestData: {
          contains: duplicateMarker,
        },
      },
      select: { id: true },
    });

    if (existingPending) {
      return NextResponse.json(
        {
          success: false,
          error: "A pending removal request already exists for this attendee",
          approvalId: existingPending.id,
        },
        { status: 409, headers: rateLimit.headers }
      );
    }

    const details =
      parsedBody.data.reason ||
      `Coach requested attendee removal for ${registration.firstName} ${registration.lastName}`.trim();

    const approval = await db.approvalQueue.create({
      data: {
        type: "CANCELLATION",
        coachId: registration.workshop.coachId,
        workshopId: registration.workshopId,
        status: "PENDING",
        requestedBy: actor.email,
        requestData: JSON.stringify({
          registrationId: registration.id,
          attendeeEmail: registration.email,
          attendeeName: `${registration.firstName} ${registration.lastName}`.trim(),
          workshopTitle: registration.workshop.title,
          workshopDate: registration.workshop.eventDate.toISOString(),
          details,
          requestedBy: actor.email,
          requestedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Removal request submitted for admin review",
        approvalId: approval.id,
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (error) {
    console.error("Error submitting registration removal request:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit removal request" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
