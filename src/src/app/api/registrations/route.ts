import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRegistrationSchema } from "@/lib/validations";
import { canManageCoachData, getApiActor } from "@/lib/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/inngest/client";
import {
  createWorkshopRegistration,
  RegistrationServiceError,
} from "@/lib/registration-service";

async function publishRegistrationCreatedEvent(registration: {
  id: string;
  workshopId: string;
  email: string;
  firstName: string;
}) {
  if (process.env.NODE_ENV === "test" || !process.env.INNGEST_EVENT_KEY) {
    return;
  }

  try {
    await inngest.send({
      name: "registration/created",
      data: {
        registrationId: registration.id,
        workshopId: registration.workshopId,
        email: registration.email,
        firstName: registration.firstName,
      },
    });
  } catch (error) {
    // Preserve registration success even if async workflow emission fails.
    console.error("Failed to publish registration/created event:", error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const workshopId = searchParams.get("workshopId");
    const parsedPage = parseInt(searchParams.get("page") || "1", 10);
    const parsedPageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0
        ? Math.min(100, parsedPageSize)
        : 50;

    if (!workshopId) {
      return NextResponse.json(
        { success: false, error: "workshopId is required" },
        { status: 400 }
      );
    }

    const workshop = await db.workshop.findUnique({
      where: { id: workshopId },
      select: { id: true, coachId: true },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    if (!canManageCoachData(actor, workshop.coachId)) {
      // Hide existence if user is not allowed.
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
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
  const rateLimit = await withRateLimit(request, RateLimits.registration);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    const body = await request.json();
    const validation = createRegistrationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const { registration } = await createWorkshopRegistration(validation.data, {
      includeWorkshopDetails: true,
    });

    await publishRegistrationCreatedEvent({
      id: registration.id,
      workshopId: registration.workshopId,
      email: registration.email,
      firstName: registration.firstName,
    });

    return NextResponse.json(
      {
        success: true,
        data: registration,
        message: "Registration successful",
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (error) {
    if (error instanceof RegistrationServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status, headers: rateLimit.headers }
      );
    }

    console.error("Error creating registration:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create registration" },
      { status: 500 }
    );
  }
}
