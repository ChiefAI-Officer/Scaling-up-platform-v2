import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateWorkshopSchema } from "@/lib/validations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const workshop = await db.workshop.findUnique({
      where: { id },
      include: {
        coach: true,
        workshopType: true,
        registrations: {
          orderBy: { createdAt: "desc" },
        },
        campaigns: true,
        tasks: {
          orderBy: { createdAt: "desc" },
        },
        landingPages: {
          select: {
            id: true,
            template: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: workshop });
  } catch (error) {
    console.error("Error fetching workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workshop" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = updateWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = await db.workshop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    const data = validation.data;
    const workshop = await db.workshop.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.format && { format: data.format }),
        ...(data.duration && { duration: data.duration }),
        ...(data.eventDate && { eventDate: new Date(data.eventDate) }),
        ...(data.eventTime !== undefined && { eventTime: data.eventTime }),
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.venueName !== undefined && { venueName: data.venueName }),
        ...(data.venueAddress !== undefined && {
          venueAddress: data.venueAddress ? JSON.stringify(data.venueAddress) : null
        }),
        ...(data.parkingInstructions !== undefined && {
          parkingInstructions: data.parkingInstructions,
        }),
        ...(data.virtualPlatform !== undefined && {
          virtualPlatform: data.virtualPlatform,
        }),
        ...(data.virtualLink !== undefined && {
          virtualLink: data.virtualLink || null,
        }),
        ...(data.isFree !== undefined && { isFree: data.isFree }),
        ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
        ...(data.earlyBirdPriceCents !== undefined && {
          earlyBirdPriceCents: data.earlyBirdPriceCents,
        }),
        ...(data.earlyBirdDeadline !== undefined && {
          earlyBirdDeadline: data.earlyBirdDeadline
            ? new Date(data.earlyBirdDeadline)
            : null,
        }),
        ...(data.maxAttendees !== undefined && { maxAttendees: data.maxAttendees }),
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: workshop,
      message: "Workshop updated successfully",
    });
  } catch (error) {
    console.error("Error updating workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update workshop" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.workshop.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    // Soft delete by setting status to CANCELLED
    await db.workshop.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({
      success: true,
      message: "Workshop cancelled successfully",
    });
  } catch (error) {
    console.error("Error deleting workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete workshop" },
      { status: 500 }
    );
  }
}
