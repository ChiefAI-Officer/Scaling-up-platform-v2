import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  generateIcsContent,
  parseDurationHours,
  buildLocationString,
} from "@/lib/ics-generator";
import { z } from "zod";

const workshopIcsParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
});

/**
 * GET /api/workshops/[id]/ics
 * Download an .ics calendar file for a workshop.
 * Public endpoint — no auth required (used on landing pages and success pages).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsValidation = workshopIcsParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { error: "Invalid workshop id", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const { id } = paramsValidation.data;

    const workshop = await db.workshop.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        eventDate: true,
        eventTime: true,
        timezone: true,
        duration: true,
        format: true,
        venueName: true,
        venueAddress: true,
        virtualLink: true,
        virtualPlatform: true,
        landingPageSlug: true,
        coach: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!workshop) {
      return NextResponse.json(
        { error: "Workshop not found" },
        { status: 404 }
      );
    }

    const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
    const workshopUrl = workshop.landingPageSlug
      ? `${appUrl}/workshop/${workshop.landingPageSlug}`
      : undefined;

    const icsContent = generateIcsContent({
      uid: workshop.id,
      title: workshop.title,
      description: workshop.description,
      eventDate: workshop.eventDate,
      eventTime: workshop.eventTime,
      timezone: workshop.timezone,
      durationHours: parseDurationHours(workshop.duration),
      location: buildLocationString(workshop),
      url: workshopUrl,
      organizer: workshop.coach
        ? {
            name: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
            email: workshop.coach.email,
          }
        : null,
    });

    // Sanitize title for filename
    const safeTitle = workshop.title
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle}.ics"`,
      },
    });
  } catch (error) {
    console.error("ICS generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate calendar file" },
      { status: 500 }
    );
  }
}
