import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createWorkshopSchema } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { validateLeadTime } from "@/lib/lead-time-validator";

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const requestedCoachId = searchParams.get("coachId");
    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const parsedPageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0
        ? Math.min(100, parsedPageSize)
        : 20;

    const where: { status?: string; coachId?: string } = {};
    if (status) {
      where.status = status;
    }

    if (isPrivilegedRole(actor.role)) {
      if (requestedCoachId) {
        where.coachId = requestedCoachId;
      }
    } else {
      if (!actor.coachId) {
        return NextResponse.json({ success: false, error: "Coach profile required" }, { status: 403 });
      }

      if (requestedCoachId && requestedCoachId !== actor.coachId) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }

      where.coachId = actor.coachId;
    }

    const [workshops, total] = await Promise.all([
      db.workshop.findMany({
        where,
        include: {
          coach: true,
          workshopType: true,
          _count: {
            select: { registrations: true },
          },
        },
        orderBy: { eventDate: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.workshop.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: workshops,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching workshops:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workshops" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const validation = createWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;
    const leadTimeValidation = validateLeadTime(new Date(data.eventDate));
    if (!leadTimeValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: leadTimeValidation.reason || "Invalid event date",
          requiresApproval: leadTimeValidation.requiresApproval,
          leadTimeDays: leadTimeValidation.leadTimeDays,
        },
        { status: leadTimeValidation.requiresApproval ? 409 : 400 }
      );
    }

    // Verify coach exists and is eligible
    const coach = await db.coach.findUnique({
      where: { id: data.coachId },
      include: {
        certifications: {
          where: { workshopTypeId: data.workshopTypeId },
        },
      },
    });

    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    // Check certification status
    const certification = coach.certifications[0];
    if (!certification || certification.status !== "ACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: "Coach is not certified for this workshop type",
        },
        { status: 400 }
      );
    }

    // Verify workshop type exists
    const workshopType = await db.workshopType.findUnique({
      where: { id: data.workshopTypeId },
    });

    if (!workshopType) {
      return NextResponse.json(
        { success: false, error: "Workshop type not found" },
        { status: 404 }
      );
    }

    // Create workshop
    const category = body.category === "EXIT_AND_VALUATION" ? "EXIT_AND_VALUATION" : "AI";

    const workshop = await db.workshop.create({
      data: {
        coachId: data.coachId,
        workshopTypeId: data.workshopTypeId,
        title: data.title,
        description: data.description,
        category,
        format: data.format,
        duration: data.duration || "full-day",
        eventDate: new Date(data.eventDate),
        eventTime: data.eventTime,
        timezone: data.timezone,
        venueName: data.venueName,
        venueAddress: data.venueAddress ? JSON.stringify(data.venueAddress) : null,
        parkingInstructions: data.parkingInstructions,
        virtualPlatform: data.virtualPlatform,
        virtualLink: data.virtualLink || null,
        isFree: data.isFree,
        priceCents: data.priceCents,
        earlyBirdPriceCents: data.earlyBirdPriceCents,
        earlyBirdDeadline: data.earlyBirdDeadline
          ? new Date(data.earlyBirdDeadline)
          : null,
        maxAttendees: data.maxAttendees,
        status: "REQUESTED",
      },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    // Generate landing page slug
    const slug = generateSlug(data.title, workshop.id);
    await db.workshop.update({
      where: { id: workshop.id },
      data: { landingPageSlug: slug },
    });

    return NextResponse.json(
      {
        success: true,
        data: { ...workshop, landingPageSlug: slug },
        message: "Workshop created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating workshop:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create workshop" },
      { status: 500 }
    );
  }
}
