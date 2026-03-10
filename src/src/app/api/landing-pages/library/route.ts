import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { interpolateContent, buildWorkshopVariables } from "@/lib/template-interpolation";
import { z } from "zod";

const TEMPLATE_OPTIONS = ["SOLO_LANDING", "DUO_LANDING", "REGISTRATION"] as const;
type TemplateType = (typeof TEMPLATE_OPTIONS)[number];

const landingPageLibraryQuerySchema = z.object({
  template: z.string().trim().optional(),
});

const applyLandingPageTemplateSchema = z.object({
  targetWorkshopId: z.string().min(1, "targetWorkshopId is required"),
  targetTemplate: z.string().min(1, "targetTemplate is required"),
  sourceLandingPageId: z.string().min(1, "sourceLandingPageId is required"),
});

function isTemplateType(value: string): value is TemplateType {
  return TEMPLATE_OPTIONS.includes(value as TemplateType);
}

function toTemplateEditorPath(template: TemplateType): string {
  return template.toLowerCase().replace("_", "-");
}

function generateSlug(workshopTitle: string, template: TemplateType): string {
  const base = workshopTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${template.toLowerCase().replace(/_/g, "-")}-${Date.now().toString(36)}`;
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

    const queryValidation = landingPageLibraryQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters", details: queryValidation.error.issues },
        { status: 400 }
      );
    }

    const templateParam = queryValidation.data.template || "";
    const normalizedTemplate = templateParam.toUpperCase();

    if (templateParam && !isTemplateType(normalizedTemplate)) {
      return NextResponse.json(
        { success: false, error: "Invalid template" },
        { status: 400 }
      );
    }

    if (!isPrivilegedRole(actor.role) && !actor.coachId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const where: Prisma.LandingPageWhereInput = {
      template: isTemplateType(normalizedTemplate)
        ? normalizedTemplate
        : { in: [...TEMPLATE_OPTIONS] },
      ...(isPrivilegedRole(actor.role)
        ? {}
        : {
            workshop: {
              coachId: actor.coachId!,
            },
          }),
    };

    const pages = await db.landingPage.findMany({
      where,
      select: {
        id: true,
        template: true,
        status: true,
        slug: true,
        createdAt: true,
        workshopId: true,
        workshop: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    });

    const data = pages.map((page) => ({
      id: page.id,
      template: page.template,
      status: page.status,
      slug: page.slug,
      createdAt: page.createdAt.toISOString(),
      workshopId: page.workshopId,
      workshopTitle: page.workshop.title,
      editPath: `/workshops/${page.workshopId}/landing-pages/${toTemplateEditorPath(
        page.template as TemplateType
      )}`,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to load landing page library:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load landing page library" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const bodyValidation = applyLandingPageTemplateSchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { targetWorkshopId, sourceLandingPageId, targetTemplate } = bodyValidation.data;
    const targetTemplateRaw = targetTemplate.toUpperCase();

    if (!isTemplateType(targetTemplateRaw)) {
      return NextResponse.json(
        { success: false, error: "targetTemplate is invalid" },
        { status: 400 }
      );
    }

    const [targetWorkshop, sourcePage] = await Promise.all([
      db.workshop.findUnique({
        where: { id: targetWorkshopId },
        select: { id: true, title: true, coachId: true },
      }),
      db.landingPage.findUnique({
        where: { id: sourceLandingPageId },
        include: {
          workshop: {
            select: { coachId: true },
          },
        },
      }),
    ]);

    if (!targetWorkshop || !canManageCoachData(actor, targetWorkshop.coachId)) {
      return NextResponse.json(
        { success: false, error: "Target workshop not found" },
        { status: 404 }
      );
    }

    if (
      !sourcePage ||
      !canManageCoachData(actor, sourcePage.workshop.coachId) ||
      sourcePage.template !== targetTemplateRaw
    ) {
      return NextResponse.json(
        { success: false, error: "Source template not found or not allowed" },
        { status: 404 }
      );
    }

    // Re-interpolate template variables for the target workshop (e.g. coach name, title)
    const variables = await buildWorkshopVariables(targetWorkshopId);
    const interpolatedContent = variables
      ? interpolateContent(sourcePage.content, variables)
      : sourcePage.content;

    const existingTargetPage = await db.landingPage.findUnique({
      where: {
        workshopId_template: {
          workshopId: targetWorkshopId,
          template: targetTemplateRaw,
        },
      },
    });

    const landingPage = existingTargetPage
      ? await db.landingPage.update({
          where: { id: existingTargetPage.id },
          data: {
            content: interpolatedContent,
            status: "DRAFT",
            updatedAt: new Date(),
          },
        })
      : await db.landingPage.create({
          data: {
            workshopId: targetWorkshopId,
            template: targetTemplateRaw,
            slug: generateSlug(targetWorkshop.title, targetTemplateRaw),
            content: interpolatedContent,
            status: "DRAFT",
            publishedAt: null,
          },
        });

    return NextResponse.json({
      success: true,
      data: {
        id: landingPage.id,
        workshopId: landingPage.workshopId,
        template: landingPage.template,
        status: landingPage.status,
        slug: landingPage.slug,
      },
      message: "Template content copied successfully",
    });
  } catch (error) {
    console.error("Failed to apply landing page template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to apply landing page template" },
      { status: 500 }
    );
  }
}
