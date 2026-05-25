import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
        ...(data.bookCallUrl !== undefined && { bookCallUrl: data.bookCallUrl || null }),
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
    // Handle Prisma unique constraint violation (P2002) on hubspotId or circleId
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "This HubSpot/Circle ID is already assigned to another coach",
        },
        { status: 409 }
      );
    }
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

    let userAccountRetained = false;

    await db.$transaction(async (tx) => {
      // Block if coach owns organizations — ownerCoachId is non-nullable, can't be auto-nullified.
      const ownedOrgCount = await tx.organization.count({ where: { ownerCoachId: id } });
      if (ownedOrgCount > 0) {
        throw Object.assign(new Error("OWNS_ORGANIZATIONS"), { ownedOrgCount });
      }

      // Clean up non-cascade Coach FK relations before deleting the coach.
      // AccessGroupCoach has no onDelete; OrganizationOwnershipEvent and
      // AssessmentCampaign use nullable Coach? fields — null them out so
      // the audit trail is preserved.
      await Promise.all([
        tx.accessGroupCoach.deleteMany({ where: { coachId: id } }),
        tx.organizationOwnershipEvent.updateMany({
          where: { oldOwnerCoachId: id },
          data: { oldOwnerCoachId: null },
        }),
        tx.organizationOwnershipEvent.updateMany({
          where: { newOwnerCoachId: id },
          data: { newOwnerCoachId: null },
        }),
        tx.assessmentCampaign.updateMany({
          where: { createdByCoachId: id },
          data: { createdByCoachId: null },
        }),
      ]);

      // Count cascade-affected records inside transaction for accuracy
      const [approvalQueueCount, followUpReportCount] = await Promise.all([
        tx.approvalQueue.count({ where: { coachId: id } }),
        tx.followUpReport.count({ where: { coachId: id } }),
      ]);

      await tx.coach.delete({ where: { id } });

      // Delete linked User account to prevent orphaned logins.
      // Best-effort: if FK constraints block deletion (e.g., user created
      // assessment data with non-nullable createdBy), skip User.delete and
      // retain the account — the coach profile is gone so portal access is
      // revoked via requireCoach().
      if (existing.userId) {
        try {
          await tx.user.delete({ where: { id: existing.userId } });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2003"
          ) {
            userAccountRetained = true;
          } else {
            throw err;
          }
        }
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
            userAccountRetained,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: userAccountRetained
        ? "Coach deleted. User account retained (linked to assessment data)."
        : "Coach deleted successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OWNS_ORGANIZATIONS") {
      const count = (error as Error & { ownedOrgCount?: number }).ownedOrgCount ?? 1;
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete coach who owns ${count} organization(s). Transfer ownership first.`,
        },
        { status: 400 }
      );
    }
    console.error("Error deleting coach:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete coach" },
      { status: 500 }
    );
  }
}
