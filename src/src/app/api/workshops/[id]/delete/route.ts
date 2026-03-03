import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";
import { deleteWorkshopSchema } from "@/lib/validations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validation = deleteWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const workshop = await db.workshop.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        workshopCode: true,
        status: true,
        coachId: true,
        _count: {
          select: {
            registrations: true,
            landingPages: true,
            surveys: true,
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

    // Only allow deletion of CANCELED or COMPLETED workshops
    if (!["CANCELED", "COMPLETED"].includes(workshop.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot permanently delete a workshop with status "${workshop.status}". Cancel or complete it first.`,
        },
        { status: 400 }
      );
    }

    // Safety check: confirm title must match
    if (validation.data.confirmTitle !== workshop.title) {
      return NextResponse.json(
        {
          success: false,
          error: "Workshop title confirmation does not match",
        },
        { status: 400 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.workshop.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          entityType: "Workshop",
          entityId: id,
          action: "PERMANENT_DELETE",
          performedBy: actor.email,
          changes: JSON.stringify({
            workshopTitle: workshop.title,
            workshopCode: workshop.workshopCode,
            status: workshop.status,
            registrationsDeleted: workshop._count.registrations,
            landingPagesDeleted: workshop._count.landingPages,
            surveysDeleted: workshop._count.surveys,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Workshop "${workshop.title}" permanently deleted`,
    });
  } catch (error) {
    console.error("Error permanently deleting workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete workshop" },
      { status: 500 }
    );
  }
}
