import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateCoachSchema } from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

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
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

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
        ...(data.profileImage !== undefined && { profileImage: data.profileImage }),
        ...(data.linkedinUrl !== undefined && { linkedinUrl: data.linkedinUrl }),
        ...(data.showBookCallCta !== undefined && { showBookCallCta: data.showBookCallCta }),
        ...(data.bookCallUrl !== undefined && { bookCallUrl: data.bookCallUrl }),
        ...(data.hubspotId !== undefined && { hubspotId: data.hubspotId }),
        ...(data.circleId !== undefined && { circleId: data.circleId }),
        ...(data.territory !== undefined && { territory: data.territory }),
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
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

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
      (w) => !["COMPLETED", "CANCELED"].includes(w.status)
    );

    if (activeWorkshops.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete coach with ${activeWorkshops.length} active workshop(s). Cancel or complete them first.`,
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      // Count cascade-affected records inside transaction for accuracy
      const [approvalQueueCount, followUpReportCount] = await Promise.all([
        tx.approvalQueue.count({ where: { coachId: id } }),
        tx.followUpReport.count({ where: { coachId: id } }),
      ]);

      await tx.coach.delete({ where: { id } });

      // Delete linked User account to prevent orphaned logins
      if (existing.userId) {
        await tx.user.delete({ where: { id: existing.userId } });
      }

      await tx.auditLog.create({
        data: {
          entityType: "Coach",
          entityId: id,
          action: "DELETE",
          performedBy: actor.email,
          changes: JSON.stringify({
            coachName: `${existing.firstName} ${existing.lastName}`,
            coachEmail: existing.email,
            userId: existing.userId,
            workshopsDeleted: existing.workshops.length,
            approvalQueueDeleted: approvalQueueCount,
            followUpReportsDeleted: followUpReportCount,
          }),
        },
      });
    });

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
