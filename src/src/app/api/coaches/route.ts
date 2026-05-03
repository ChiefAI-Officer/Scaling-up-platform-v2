import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCoachSchema } from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { sendCoachWelcomeEmail } from "@/services/notifications";

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("certificationStatus");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search");

    const where = {
      ...(status && { certificationStatus: status }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { company: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [coaches, total] = await Promise.all([
      db.coach.findMany({
        where,
        include: {
          certifications: {
            include: {
              workshopType: true,
            },
          },
          _count: {
            select: { workshops: true },
          },
        },
        orderBy: { lastName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.coach.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: coaches,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching coaches:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coaches" },
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
    const validation = createCoachSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check if coach with email already exists
    const existing = await db.coach.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "A coach with this email already exists" },
        { status: 400 }
      );
    }

    // MR-23/MR-44: Create or reuse a User record so the coach can log in
    let user = await db.user.findUnique({ where: { email: data.email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: data.email,
          name: `${data.firstName} ${data.lastName}`,
          role: "COACH",
        },
      });
    }

    const coach = await db.coach.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        company: data.company,
        bio: data.bio,
        profileImage: data.profileImage,
        hubspotId: data.hubspotId,
        circleId: data.circleId,
        certificationStatus: "PENDING",
        paymentStatus: "PENDING",
        userId: user.id,
      },
    });

    // Send welcome email with password-set link (24h TTL)
    try {
      const token = generatePasswordResetToken(data.email, null, 24 * 60 * 60);
      const baseUrl = process.env.NEXTAUTH_URL || "https://scaling-up-platform-v2.vercel.app";
      const passwordSetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}`;
      await sendCoachWelcomeEmail({
        coachEmail: data.email,
        coachName: `${data.firstName} ${data.lastName}`,
        passwordSetUrl,
      });
    } catch (emailError) {
      console.error("Failed to send coach welcome email:", emailError);
      // Non-fatal — coach is created, email failure shouldn't block response
    }

    return NextResponse.json(
      {
        success: true,
        data: coach,
        message: "Coach created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating coach:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create coach" },
      { status: 500 }
    );
  }
}
