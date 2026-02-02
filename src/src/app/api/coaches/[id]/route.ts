import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateCoachSchema } from "@/lib/validations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const coach = await db.coach.findUnique({
      where: { id },
      include: {
        certifications: {
          include: {
            workshopType: true,
          },
        },
        workshops: {
          include: {
            workshopType: true,
            _count: {
              select: { registrations: true },
            },
          },
          orderBy: { eventDate: "desc" },
        },
      },
    });

    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: coach });
  } catch (error) {
    console.error("Error fetching coach:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coach" },
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
    const validation = updateCoachSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const existing = await db.coach.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    const data = validation.data;
    const coach = await db.coach.update({
      where: { id },
      data: {
        ...(data.email && { email: data.email }),
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.company !== undefined && { company: data.company }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.hubspotId !== undefined && { hubspotId: data.hubspotId }),
        ...(data.circleId !== undefined && { circleId: data.circleId }),
      },
    });

    return NextResponse.json({
      success: true,
      data: coach,
      message: "Coach updated successfully",
    });
  } catch (error) {
    console.error("Error updating coach:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update coach" },
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

    const existing = await db.coach.findUnique({
      where: { id },
      include: { workshops: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    // Check for active workshops
    const activeWorkshops = existing.workshops.filter(
      (w) => !["COMPLETED", "CANCELLED"].includes(w.status)
    );

    if (activeWorkshops.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot delete coach with active workshops",
        },
        { status: 400 }
      );
    }

    await db.coach.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Coach deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting coach:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete coach" },
      { status: 500 }
    );
  }
}
