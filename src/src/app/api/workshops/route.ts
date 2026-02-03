import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createWorkshopSchema } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const coachId = searchParams.get("coachId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    const where = {
      ...(status && { status }),
      ...(coachId && { coachId }),
    };

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
    const body = await request.json();
    const validation = createWorkshopSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

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
    const workshop = await db.workshop.create({
      data: {
        coachId: data.coachId,
        workshopTypeId: data.workshopTypeId,
        title: data.title,
        description: data.description,
        category: body.category || "AI",
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
