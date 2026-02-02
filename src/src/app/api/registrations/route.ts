import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRegistrationSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workshopId = searchParams.get("workshopId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");

    if (!workshopId) {
      return NextResponse.json(
        { success: false, error: "workshopId is required" },
        { status: 400 }
      );
    }

    const where = { workshopId };

    const [registrations, total] = await Promise.all([
      db.registration.findMany({
        where,
        include: {
          workshop: {
            include: {
              workshopType: true,
              coach: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.registration.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: registrations,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch registrations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = createRegistrationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify workshop exists and is open for registration
    const workshop = await db.workshop.findUnique({
      where: { id: data.workshopId },
      include: {
        _count: { select: { registrations: true } },
      },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    if (!["REGISTRATION_OPEN", "MARKETING_ACTIVE"].includes(workshop.status)) {
      return NextResponse.json(
        { success: false, error: "Workshop is not open for registration" },
        { status: 400 }
      );
    }

    // Check capacity
    if (workshop._count.registrations >= workshop.maxAttendees) {
      return NextResponse.json(
        { success: false, error: "Workshop is at full capacity" },
        { status: 400 }
      );
    }

    // Check for duplicate registration
    const existing = await db.registration.findFirst({
      where: {
        workshopId: data.workshopId,
        email: data.email,
        status: { not: "CANCELLED" },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "You are already registered for this workshop" },
        { status: 400 }
      );
    }

    // Create registration
    const registration = await db.registration.create({
      data: {
        workshopId: data.workshopId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        jobTitle: data.jobTitle,
        phone: data.phone,
        paymentStatus: workshop.isFree ? "FREE" : "PENDING",
        status: "REGISTERED",
      },
      include: {
        workshop: {
          include: {
            workshopType: true,
            coach: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: registration,
        message: "Registration successful",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating registration:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create registration" },
      { status: 500 }
    );
  }
}
