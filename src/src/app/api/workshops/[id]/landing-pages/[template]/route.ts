import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { validateCustomCode } from "@/lib/templates/interpolate-custom-code";
import { buildWorkshopVariables } from "@/lib/templates/template-interpolation";
import { interpolateContentForHtml } from "@/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";
import { z } from "zod";

const VALID_TEMPLATES = ["BIO_PAGE", "SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"] as const;
type TemplateType = typeof VALID_TEMPLATES[number];

// TEMPLATE-02: eligibility filter — only SOLO_LANDING / DUO_LANDING may carry customHtml.
const ELIGIBLE_CUSTOM_HTML: readonly TemplateType[] = ["SOLO_LANDING", "DUO_LANDING"] as const;

interface RouteParams {
  params: Promise<{ id: string; template: string }>;
}

const landingPageParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
  template: z.string().min(1, "Template is required"),
});

const updateLandingPageBodySchema = z.object({
  content: z.unknown(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  // ENH-MAY6-5: admin can edit per-workshop affiliate/tracking code.
  // Coach role attempts get 403. parse5 validation runs server-side via
  // validateCustomCode (CHG-03). Pass null to clear.
  customCode: z.string().nullable().optional(),
  // TEMPLATE-02: admin can override the template-default customHtml. Eligibility
  // gated below (only SOLO_LANDING / DUO_LANDING). Sanitized server-side.
  customHtml: z.string().max(500_000).nullable().optional(),
});

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

    const paramsValidation = landingPageParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid route parameters", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const { id, template } = paramsValidation.data;
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
      console.error("[landing-page PUT] unauthenticated request");
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const paramsValidation = landingPageParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      console.error("[landing-page PUT] invalid params:", paramsValidation.error.issues);
      return NextResponse.json(
        { success: false, error: "Invalid route parameters", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const { id, template } = paramsValidation.data;
    const normalizedTemplate = normalizeTemplate(template);

    if (!normalizedTemplate) {
      console.error("[landing-page PUT] invalid template:", template);
      return NextResponse.json(
        { success: false, error: "Invalid template type" },
        { status: 400 }
      );
    }

    const bodyValidation = updateLandingPageBodySchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      console.error("[landing-page PUT] body validation failed:", bodyValidation.error.issues);
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { content, status, customCode, customHtml } = bodyValidation.data;

    // ENH-MAY6-5: customCode editing is admin/staff only. Coach attempts
    // (including via crafted PUT bodies) are rejected. validateCustomCode is
    // re-run server-side regardless — defense in depth, parse5 host-pinned.
    if (customCode !== undefined) {
      if (!isPrivilegedRole(actor.role)) {
        return NextResponse.json(
          { success: false, error: "Forbidden — admin/staff only" },
          { status: 403 }
        );
      }
      if (customCode !== null && customCode.length > 0) {
        const validation = validateCustomCode(customCode);
        if (!validation.valid) {
          return NextResponse.json(
            { success: false, error: validation.error },
            { status: 400 }
          );
        }
      }
    }

    // TEMPLATE-02: eligibility filter — reject inbound customHtml on ineligible template types.
    if (
      customHtml !== undefined &&
      customHtml !== null &&
      !ELIGIBLE_CUSTOM_HTML.includes(normalizedTemplate)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `customHtml is not eligible for template ${normalizedTemplate} (allowed: ${ELIGIBLE_CUSTOM_HTML.join(", ")})`,
        },
        { status: 400 }
      );
    }

    // TEMPLATE-02: sanitize admin-supplied customHtml override defense-in-depth
    // (PATCH on PageTemplate sanitizes too, but PUT may receive raw HTML).
    let sanitizedCustomHtml: string | null | undefined = customHtml;
    if (typeof customHtml === "string" && customHtml.length > 0) {
      sanitizedCustomHtml = sanitizeCustomHtml(customHtml).sanitized;
    }

    // Check if workshop exists
    // CHG-03: include categoryId so we can match a per-category PageTemplate
    // for customCode copy-through using the same precedence as auto-build.
    const workshop = await db.workshop.findUnique({
      where: { id },
      select: { id: true, title: true, coachId: true, categoryId: true },
    });

    if (!workshop || !canManageCoachData(actor, workshop.coachId)) {
      console.error("[landing-page PUT] workshop not found or access denied:", id);
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
          // ENH-MAY6-5: only set customCode when explicitly provided.
          // Undefined keeps existing value; null clears.
          ...(customCode !== undefined ? { customCode } : {}),
          // TEMPLATE-02: only set customHtml when explicitly provided. Eligibility
          // checked above; sanitized value used.
          ...(customHtml !== undefined ? { customHtml: sanitizedCustomHtml } : {}),
        },
      });
    } else {
      // Create new
      const slug = generateSlug(id, normalizedTemplate, workshop.title);

      // CHG-03: copy customCode from the matching admin-blessed PageTemplate
      // (category-scoped wins over global; falls back to all-active when
      // category match is empty — same precedence as auto-build).
      // TEMPLATE-02: also copy customHtml (eligibility-filtered + interpolated).
      const candidateTemplates = await db.pageTemplate.findMany({
        where: {
          templateType: normalizedTemplate,
          isActive: true,
          OR: [
            { categoryId: workshop.categoryId },
            { categoryId: null },
          ],
        },
        select: { customCode: true, customHtml: true, categoryId: true },
      });
      let chosenTemplate:
        | { customCode: string | null; customHtml: string | null; categoryId: string | null }
        | null = candidateTemplates.find((t) => t.categoryId !== null) ?? candidateTemplates[0] ?? null;
      if (!chosenTemplate && workshop.categoryId) {
        const fallback = await db.pageTemplate.findFirst({
          where: { templateType: normalizedTemplate, isActive: true },
          select: { customCode: true, customHtml: true },
        });
        if (fallback) chosenTemplate = { customCode: fallback.customCode, customHtml: fallback.customHtml, categoryId: null };
      }

      // TEMPLATE-02: eligibility filter — only SOLO_LANDING / DUO_LANDING carry customHtml.
      let templateCustomHtml: string | null = null;
      if (
        chosenTemplate?.customHtml &&
        chosenTemplate.customHtml.trim().length > 0 &&
        ELIGIBLE_CUSTOM_HTML.includes(normalizedTemplate)
      ) {
        const variables = await buildWorkshopVariables(id);
        templateCustomHtml = variables
          ? interpolateContentForHtml(chosenTemplate.customHtml, variables)
          : chosenTemplate.customHtml;
      }

      landingPage = await db.landingPage.create({
        data: {
          workshopId: id,
          template: normalizedTemplate,
          slug,
          content: JSON.stringify(content),
          status: status || "DRAFT",
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          // ENH-MAY6-5: explicit body customCode wins over template-default.
          customCode: customCode ?? chosenTemplate?.customCode ?? null,
          // TEMPLATE-02: explicit body customHtml (sanitized) > template-copy (interpolated) > null.
          customHtml:
            sanitizedCustomHtml !== undefined ? sanitizedCustomHtml : templateCustomHtml,
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
