import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/authorization";

const VALID_TEMPLATES = ["BIO_PAGE", "SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"] as const;
type TemplateType = typeof VALID_TEMPLATES[number];

interface RouteParams {
  params: Promise<{ id: string; template: string }>;
}

function normalizeTemplate(template: string): TemplateType | null {
  const normalized = template.toUpperCase().replace(/-/g, "_");
  if (VALID_TEMPLATES.includes(normalized as TemplateType)) {
    return normalized as TemplateType;
  }
  return null;
}

function generateSlug(workshopId: string, template: TemplateType, workshopTitle?: string): string {
  const base = workshopTitle 
    ? workshopTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    : workshopId;
  const templateSuffix = template.toLowerCase().replace(/_/g, "-");
  return `${base}-${templateSuffix}-${Date.now().toString(36)}`;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id, template } = await params;
    const normalizedTemplate = normalizeTemplate(template);

    if (!normalizedTemplate) {
      return NextResponse.json(
        { success: false, error: "Invalid template type" },
        { status: 400 }
      );
    }

    const workshopAccess = await db.workshop.findUnique({
      where: { id },
      select: { coachId: true },
    });

    if (!workshopAccess || !canManageCoachData(actor, workshopAccess.coachId)) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    const landingPage = await db.landingPage.findUnique({
      where: {
        workshopId_template: {
          workshopId: id,
          template: normalizedTemplate,
        },
      },
    });

    if (!landingPage) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: true, data: landingPage });
  } catch (error) {
    console.error("Error fetching landing page:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch landing page" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id, template } = await params;
    const normalizedTemplate = normalizeTemplate(template);

    if (!normalizedTemplate) {
      return NextResponse.json(
        { success: false, error: "Invalid template type" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content, status } = body;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 }
      );
    }

    // Check if workshop exists
    const workshop = await db.workshop.findUnique({
      where: { id },
      select: { id: true, title: true, coachId: true },
    });

    if (!workshop || !canManageCoachData(actor, workshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    // Check if landing page exists
    const existing = await db.landingPage.findUnique({
      where: {
        workshopId_template: {
          workshopId: id,
          template: normalizedTemplate,
        },
      },
    });

    let landingPage;

    if (existing) {
      // Update existing
      landingPage = await db.landingPage.update({
        where: { id: existing.id },
        data: {
          content: JSON.stringify(content),
          status: status || existing.status,
          publishedAt: status === "PUBLISHED" ? new Date() : existing.publishedAt,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new
      const slug = generateSlug(id, normalizedTemplate, workshop.title);
      
      landingPage = await db.landingPage.create({
        data: {
          workshopId: id,
          template: normalizedTemplate,
          slug,
          content: JSON.stringify(content),
          status: status || "DRAFT",
          publishedAt: status === "PUBLISHED" ? new Date() : null,
        },
      });
    }

    return NextResponse.json({ success: true, data: landingPage });
  } catch (error) {
    console.error("Error saving landing page:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save landing page" },
      { status: 500 }
    );
  }
}
