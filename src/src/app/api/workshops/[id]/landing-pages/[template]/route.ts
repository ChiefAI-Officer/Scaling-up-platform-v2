import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { validateCustomCode } from "@/lib/templates/interpolate-custom-code";
import { buildWorkshopVariables } from "@/lib/templates/template-interpolation";
import { interpolateContentForHtml } from "@/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "@/lib/templates/sanitize-custom-html";
import { buildEnrichedLandingPageVariables } from "@/lib/templates/landing-page-variables";
import { RateLimits, checkRateLimitAsync } from "@/lib/rate-limit";
import { z } from "zod";

const VALID_TEMPLATES = ["BIO_PAGE", "SOLO_LANDING", "DUO_LANDING", "REGISTRATION", "THANK_YOU"] as const;
type TemplateType = typeof VALID_TEMPLATES[number];

// TEMPLATE-02: eligibility filter — only SOLO_LANDING / DUO_LANDING may carry customHtml.
const ELIGIBLE_CUSTOM_HTML: readonly TemplateType[] = ["SOLO_LANDING", "DUO_LANDING"] as const;

// Wave B Task 2: matches CUSTOM_HTML_MAX_LENGTH in /api/page-templates/[id].
// Applied to the inbound string AND the post-interpolation rendered string.
const CUSTOM_HTML_MAX_LENGTH = 500_000;

// Wave B Task 2: default-off feature flag. When unset/falsy, the per-workshop
// customHtml write path is fully blocked and the route behaves exactly as before
// (content / status / customCode unaffected).
function isCustomHtmlEditorEnabled(): boolean {
  const v = process.env.WORKSHOP_CUSTOM_HTML_EDITOR_ENABLED;
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

// Wave B Task 2: sha256 hex for audit metadata (never logs the HTML itself).
function sha(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

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
  // Wave B Task 2: admin-only per-workshop raw HTML override. Default-off flag,
  // mode-exclusive (cannot coexist with content/status/customCode), value-compare
  // CAS via expectedCustomHtml, sanitized + interpolated on write. null clears.
  customHtml: z.string().max(CUSTOM_HTML_MAX_LENGTH).nullable().optional(),
  // Value-compare CAS sentinel (R2-MED-2). Required (even if null) on updates to
  // an existing row; absent on first-save create.
  expectedCustomHtml: z.string().nullable().optional(),
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

    // Parse raw JSON first so we can detect explicit key PRESENCE (Zod .optional()
    // collapses "absent" and "present: undefined"). The CAS gate below distinguishes
    // a missing expectedCustomHtml field from an explicit null.
    let rawBody: Record<string, unknown>;
    try {
      const parsed = await request.json();
      rawBody = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const bodyValidation = updateLandingPageBodySchema.safeParse(rawBody);
    if (!bodyValidation.success) {
      console.error("[landing-page PUT] body validation failed:", bodyValidation.error.issues);
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { content, status, customCode, customHtml, expectedCustomHtml } = bodyValidation.data;
    const hasExpectedCustomHtmlField = "expectedCustomHtml" in rawBody;

    // -----------------------------------------------------------------------
    // Wave B Task 2: per-workshop customHtml write path.
    // All gating below is skipped entirely when no customHtml key was sent —
    // existing content / status / customCode flows are unchanged.
    // -----------------------------------------------------------------------
    if (customHtml !== undefined) {
      // Flag gate (R3-HIGH-1): default-off. Block the entire customHtml path.
      if (!isCustomHtmlEditorEnabled()) {
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404 }
        );
      }

      // Admin/staff only (mirror customCode). Coach attempts — including crafted
      // bodies — are rejected before any DB work.
      if (!isPrivilegedRole(actor.role)) {
        return NextResponse.json(
          { success: false, error: "Forbidden — admin/staff only" },
          { status: 403 }
        );
      }

      // Mode-exclusive (R2-MED-1): a customHtml save must not also carry
      // content / status / customCode.
      if (content !== undefined || status !== undefined || customCode !== undefined) {
        return NextResponse.json(
          { success: false, error: "customHtml save must be exclusive" },
          { status: 400 }
        );
      }

      // Eligibility: only SOLO_LANDING / DUO_LANDING may carry non-null customHtml.
      if (customHtml !== null && !ELIGIBLE_CUSTOM_HTML.includes(normalizedTemplate)) {
        return NextResponse.json(
          { success: false, error: "customHtml is only allowed on SOLO_LANDING / DUO_LANDING" },
          { status: 400 }
        );
      }

      // Per-actor (and per-workshop) rate limit to bound audit-row growth.
      const rl = await checkRateLimitAsync(
        `customhtml:${actor.email}:${id}`,
        RateLimits.standard
      );
      if (!rl.success) {
        return NextResponse.json(
          { success: false, error: "Too many requests" },
          { status: 429 }
        );
      }
    }

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

    // -----------------------------------------------------------------------
    // Wave B Task 2: dedicated customHtml write path (mode-exclusive — runs only
    // when no content/status/customCode were sent). Returns early; the legacy
    // block below is untouched for non-customHtml requests.
    // -----------------------------------------------------------------------
    if (customHtml !== undefined) {
      // CAS-required gate (R2-MED-2): an update to an existing row MUST carry an
      // explicit expectedCustomHtml field (null permitted) so two editors cannot
      // silently clobber each other. Not required on first-save create.
      if (existing && !hasExpectedCustomHtmlField) {
        return NextResponse.json(
          { success: false, error: "expectedCustomHtml is required to update an existing override" },
          { status: 400 }
        );
      }

      // Sanitize-on-write, two-stage (mirror auto-build): interpolate tokens with
      // the enriched variable map, then strict-sanitize (no token URIs allowed).
      const vars = await buildEnrichedLandingPageVariables(id);
      const interpolated =
        customHtml === null
          ? null
          : vars
            ? interpolateContentForHtml(customHtml, vars)
            : customHtml;
      const { sanitized: safe, didStripContent: didStrip } =
        interpolated === null
          ? { sanitized: null as string | null, didStripContent: false }
          : sanitizeCustomHtml(interpolated, { allowTokenUris: false });
      const safeOrNull: string | null = customHtml === null ? null : safe;

      // Post-interpolation length cap (R2-MED-3): the rendered string may exceed
      // the inbound cap once tokens expand.
      if (safeOrNull && safeOrNull.length > CUSTOM_HTML_MAX_LENGTH) {
        return NextResponse.json(
          { success: false, error: "rendered HTML exceeds size limit" },
          { status: 400 }
        );
      }

      if (existing) {
        // Column-scoped value-compare CAS update + prior-body audit in ONE tx.
        const expected = expectedCustomHtml ?? null;
        const saved = await db.$transaction(async (tx) => {
          const res = await tx.landingPage.updateMany({
            where: { id: existing.id, customHtml: expected },
            data: {
              updatedAt: new Date(),
              customHtml: safeOrNull,
            },
          });
          if (res.count === 0) {
            // Stored value moved since the editor loaded it (or wrong expected).
            return null;
          }
          await tx.auditLog.create({
            data: {
              entityType: "LandingPage",
              entityId: existing.id,
              action: "UPDATE_CUSTOM_HTML",
              performedBy: actor.email,
              changes: JSON.stringify({
                op: "save",
                template: normalizedTemplate,
                previousCustomHtml: existing.customHtml ?? null,
                prevSha: sha(existing.customHtml ?? ""),
                newSha: sha(safeOrNull ?? ""),
                newCustomHtmlLength: (safeOrNull ?? "").length,
                actorRole: actor.role,
                sanitizerStripped: didStrip,
              }),
            },
          });
          return tx.landingPage.findUnique({ where: { id: existing.id } });
        });

        if (!saved) {
          return NextResponse.json(
            {
              success: false,
              error: "This page changed since you opened it — reload and re-apply.",
            },
            { status: 409 }
          );
        }

        return NextResponse.json({
          success: true,
          data: saved,
          customHtml: saved.customHtml ?? null,
          sanitizerStripped: didStrip,
        });
      }

      // No existing row → first save. Synthesize valid content from the active
      // PageTemplate (NEVER JSON.stringify(undefined)). No CAS on create; a
      // concurrent insert surfaces as Prisma P2002 → 409.
      const slug = generateSlug(id, normalizedTemplate, workshop.title);
      const candidateTemplates = await db.pageTemplate.findMany({
        where: {
          templateType: normalizedTemplate,
          isActive: true,
          OR: [{ categoryId: workshop.categoryId }, { categoryId: null }],
        },
        select: { content: true, customCode: true, categoryId: true },
      });
      const chosen =
        candidateTemplates.find((t) => t.categoryId !== null) ?? candidateTemplates[0] ?? null;

      // Synthesize content: prefer the template's JSON content, else an empty
      // object string. Guard against a malformed template content value.
      let synthesizedContent = "{}";
      if (chosen?.content && typeof chosen.content === "string") {
        try {
          JSON.parse(chosen.content);
          synthesizedContent = chosen.content;
        } catch {
          synthesizedContent = "{}";
        }
      }

      try {
        const created = await db.$transaction(async (tx) => {
          const row = await tx.landingPage.create({
            data: {
              workshopId: id,
              template: normalizedTemplate,
              slug,
              content: synthesizedContent,
              status: "DRAFT",
              publishedAt: null,
              customCode: chosen?.customCode ?? null,
              customHtml: safeOrNull,
            },
          });
          await tx.auditLog.create({
            data: {
              entityType: "LandingPage",
              entityId: row.id,
              action: "UPDATE_CUSTOM_HTML",
              performedBy: actor.email,
              changes: JSON.stringify({
                op: "save",
                template: normalizedTemplate,
                previousCustomHtml: null,
                prevSha: sha(""),
                newSha: sha(safeOrNull ?? ""),
                newCustomHtmlLength: (safeOrNull ?? "").length,
                actorRole: actor.role,
                sanitizerStripped: didStrip,
              }),
            },
          });
          return row;
        });

        return NextResponse.json({
          success: true,
          data: created,
          customHtml: created.customHtml ?? null,
          sanitizerStripped: didStrip,
        });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "P2002"
        ) {
          return NextResponse.json(
            {
              success: false,
              error: "This page changed since you opened it — reload and re-apply.",
            },
            { status: 409 }
          );
        }
        throw err;
      }
    }

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
          // Fix-1: customHtml is not writable from this route. Build-time copy is preserved.
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
      // Fix-2: post-interpolation strict re-sanitize catches malicious substitutions
      // (e.g. virtualLink="javascript:alert(1)") even after admin-blessed save.
      let templateCustomHtml: string | null = null;
      if (
        chosenTemplate?.customHtml &&
        chosenTemplate.customHtml.trim().length > 0 &&
        ELIGIBLE_CUSTOM_HTML.includes(normalizedTemplate)
      ) {
        const variables = await buildWorkshopVariables(id);
        const interpolated = variables
          ? interpolateContentForHtml(chosenTemplate.customHtml, variables)
          : chosenTemplate.customHtml;
        templateCustomHtml = sanitizeCustomHtml(interpolated, { allowTokenUris: false }).sanitized;
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
          // Fix-1: body customHtml dropped; only the template copy is stored.
          customHtml: templateCustomHtml,
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
