/**
 * Auto-Build Service — Shared logic for building workshop landing pages on approval.
 *
 * Called inline from approval routes (synchronous, reliable) and
 * from the Inngest auto-build function (async retry backup).
 *
 * Extracted from src/inngest/functions/auto-build-workshop.ts to eliminate
 * the hard dependency on Inngest availability for critical path operations.
 */

import { db } from "@/lib/db";
import { buildWorkshopVariables, interpolateContent, templateHasPlaceholders, findRemainingPlaceholders } from "@/lib/templates/template-interpolation";
import { interpolateContentForHtml } from "@/lib/templates/interpolate-content-html";
import { sendWorkshopBuiltEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";
import { findAutoAttachWorkflow } from "@/lib/workflows/find-auto-attach-workflow";

// TEMPLATE-02: eligibility filter — only these template types may carry customHtml.
const ELIGIBLE_CUSTOM_HTML = ["SOLO_LANDING", "DUO_LANDING"] as const;

export interface AutoBuildResult {
    success: boolean;
    pagesCreated: number;
    templates: string[];
    status: string;
    preEventWorkflow: string | null;
    postEventWorkflow: string | null;
    error?: string;
}

/**
 * Run the full auto-build pipeline for a workshop:
 * 1. Fetch workshop + build template variables
 * 2. Find active PageTemplates (category match → global fallback)
 * 3. Create landing pages with interpolated content (status: PUBLISHED)
 * 4. Assign PRE_EVENT + POST_EVENT workflows
 * 5. Update workshop status to PRE_EVENT
 * 6. Send coach notification email
 */
export async function runAutoBuild(workshopId: string): Promise<AutoBuildResult> {
    // Step 1: Fetch workshop
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        include: {
            coach: {
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    bio: true,
                    profileImage: true,
                    company: true,
                },
            },
            workshopCategory: { select: { id: true, name: true, slug: true } },
            pricingTier: { select: { name: true, amountCents: true } },
        },
    });

    if (!workshop) {
        return {
            success: false,
            pagesCreated: 0,
            templates: [],
            status: "AWAITING_APPROVAL",
            preEventWorkflow: null,
            postEventWorkflow: null,
            error: `Workshop ${workshopId} not found`,
        };
    }

    // Step 2: Build template variables
    const variables = await buildWorkshopVariables(workshopId);
    if (!variables) {
        return {
            success: false,
            pagesCreated: 0,
            templates: [],
            status: "AWAITING_APPROVAL",
            preEventWorkflow: null,
            postEventWorkflow: null,
            error: `Could not build template variables for workshop ${workshopId}`,
        };
    }

    // Step 3: Find active PageTemplates (category match → global fallback)
    const categoryFilter: { OR?: Array<{ categoryId: string | null }> } = workshop.categoryId
        ? { OR: [{ categoryId: workshop.categoryId }, { categoryId: null }] }
        : {};

    let activeTemplates = await db.pageTemplate.findMany({
        where: { isActive: true, ...categoryFilter },
        // CHG-03: include customCode so it copies through to LandingPage at build time.
        // TEMPLATE-02: include customHtml so it copies through (eligibility-filtered below).
        select: { id: true, templateType: true, content: true, categoryId: true, customCode: true, customHtml: true },
    });

    // Deduplicate — prefer category-scoped over global for same template type
    const deduped = new Map<string, (typeof activeTemplates)[number]>();
    for (const tpl of activeTemplates) {
        const existing = deduped.get(tpl.templateType);
        if (!existing || (tpl.categoryId !== null && existing.categoryId === null)) {
            deduped.set(tpl.templateType, tpl);
        }
    }
    activeTemplates = Array.from(deduped.values());

    // Fallback: if category-filtered query returns nothing, try ALL active templates
    if (activeTemplates.length === 0 && workshop.categoryId) {
        activeTemplates = await db.pageTemplate.findMany({
            where: { isActive: true },
            // CHG-03: include customCode so it copies through to LandingPage at build time.
            // TEMPLATE-02: include customHtml so it copies through (eligibility-filtered below).
            select: { id: true, templateType: true, content: true, categoryId: true, customCode: true, customHtml: true },
        });
    }

    // Filter OUT corrupted templates (no placeholders = corrupted content)
    // TEMPLATE-02: keep templates whose customHtml is populated even if content is placeholder-less.
    activeTemplates = activeTemplates.filter(tpl => {
        const hasCustomHtml = !!tpl.customHtml && tpl.customHtml.trim().length > 0;
        if (!templateHasPlaceholders(tpl.content) && !hasCustomHtml) {
            console.error(
                `[auto-build-service] SKIPPING PageTemplate ${tpl.id} (${tpl.templateType}) — no {{placeholders}} ` +
                `and customHtml is empty. Content may be corrupted. ` +
                `Re-run: npx tsx prisma/seed-templates.ts`
            );
            return false;
        }
        return true;
    });

    // Zero-template guard: return early if no templates found
    if (activeTemplates.length === 0) {
        console.warn(
            `[auto-build-service] No active PageTemplates found for workshopId=${workshopId}. ` +
            `Status remains AWAITING_APPROVAL.`
        );
        return {
            success: false,
            pagesCreated: 0,
            templates: [],
            status: "AWAITING_APPROVAL",
            preEventWorkflow: null,
            postEventWorkflow: null,
            error: "No active PageTemplates found. Create templates in admin before approving workshops.",
        };
    }

    // Step 4: Create landing pages — TEMPLATE-02 two-pass interpolation.
    // Pass 1 builds REGISTRATION first so its slug is known when interpolating
    // {{registration_url}} into SOLO_LANDING / DUO_LANDING customHtml in Pass 2.
    const created: string[] = [];
    let primarySlug: string | null = null;
    let regPageSlug: string | null = null;

    const titleBase = workshop.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    async function buildOnePage(
        tpl: (typeof activeTemplates)[number],
        enrichedVars: Record<string, string | null | undefined>
    ): Promise<string | null> {
        const existingPage = await db.landingPage.findUnique({
            where: {
                workshopId_template: {
                    workshopId: workshop!.id,
                    template: tpl.templateType,
                },
            },
        });
        if (existingPage) return null;

        const interpolatedContent = interpolateContent(tpl.content, enrichedVars as Record<string, string>);

        const remaining = findRemainingPlaceholders(interpolatedContent);
        if (remaining.length > 0) {
            console.warn(
                `[auto-build-service] ${tpl.templateType} has ${remaining.length} unresolved placeholders: ${remaining.join(', ')}`
            );
        }

        const templateSuffix = tpl.templateType.toLowerCase().replace(/_/g, "-");
        const slug = `${titleBase}-${templateSuffix}-${Date.now().toString(36)}`;

        // TEMPLATE-02: eligibility filter — only SOLO_LANDING / DUO_LANDING carry customHtml.
        const interpolatedCustomHtml =
            tpl.customHtml && tpl.customHtml.trim().length > 0 &&
            (ELIGIBLE_CUSTOM_HTML as readonly string[]).includes(tpl.templateType)
                ? interpolateContentForHtml(tpl.customHtml, enrichedVars)
                : null;

        await db.landingPage.create({
            data: {
                workshopId: workshop!.id,
                template: tpl.templateType,
                slug,
                content: interpolatedContent,
                status: "PUBLISHED",
                publishedAt: new Date(),
                sourceTemplateId: tpl.id,
                // CHG-03: copy admin-blessed customCode through at build time.
                // Coach-accessible routes never accept customCode from request bodies.
                customCode: tpl.customCode ?? null,
                // TEMPLATE-02: customHtml two-pass interpolation (null on ineligible templates).
                customHtml: interpolatedCustomHtml,
            },
        });

        created.push(tpl.templateType);
        if (!primarySlug) primarySlug = slug;
        return slug;
    }

    // Pass 1: build REGISTRATION first (if present) so its slug seeds {{registration_url}}.
    const regTemplate = activeTemplates.find((t) => t.templateType === "REGISTRATION");
    if (regTemplate) {
        regPageSlug = await buildOnePage(regTemplate, variables);
    }

    // Build enriched variable map with absolute registration_url (or empty string).
    const registrationUrl = regPageSlug
        ? `${process.env.APP_URL}/workshop/${regPageSlug}`
        : "";
    const enrichedVars: Record<string, string | null | undefined> = {
        ...variables,
        registration_url: registrationUrl,
        registrationUrl, // camelCase alias for templates that prefer that form
    };

    // Pass 2: build all OTHER templates with enrichedVars.
    for (const tpl of activeTemplates) {
        if (tpl.templateType === "REGISTRATION") continue;
        await buildOnePage(tpl, enrichedVars);
    }

    // Step 4b: Link SOLO_LANDING registrationUrl → REGISTRATION page
    // TODO TEMPLATE-02 follow-up: remove redundant post-patch once content interpolation is verified
    if (created.includes("SOLO_LANDING") && created.includes("REGISTRATION")) {
        const regPage = await db.landingPage.findFirst({
            where: { workshopId, template: "REGISTRATION" },
            select: { slug: true },
        });
        const soloPage = await db.landingPage.findFirst({
            where: { workshopId, template: "SOLO_LANDING" },
            select: { id: true, content: true },
        });
        if (regPage && soloPage) {
            try {
                const soloContent = JSON.parse(soloPage.content);
                soloContent.registrationUrl = `/workshop/${regPage.slug}`;
                await db.landingPage.update({
                    where: { id: soloPage.id },
                    data: { content: JSON.stringify(soloContent) },
                });
            } catch {
                console.error("[auto-build-service] Failed to link registrationUrl on SOLO_LANDING page");
            }
        }
    }

    // Step 5: Assign workflows
    const preEventWorkflow = await assignWorkflow(workshop, "PRE_EVENT");
    const postEventWorkflow = await assignWorkflow(workshop, "POST_EVENT");

    // Step 6: Update workshop status to PRE_EVENT
    // Prefer SOLO_LANDING slug for the main landing page URL
    let landingPageSlug: string | null = primarySlug;
    if (created.length > 0) {
        const soloPage = await db.landingPage.findFirst({
            where: { workshopId, template: "SOLO_LANDING" },
            select: { slug: true },
        });
        if (soloPage?.slug) landingPageSlug = soloPage.slug;
    }

    await db.workshop.update({
        where: { id: workshopId },
        data: {
            status: "PRE_EVENT",
            ...(landingPageSlug ? { landingPageSlug } : {}),
        },
    });

    // Step 7: Send coach notification email — atomic claim prevents duplicate sends
    // on concurrent approval paths (GET email link + POST dashboard both call runAutoBuild).
    const { count: emailClaimed } = await db.workshop.updateMany({
        where: { id: workshopId, workshopBuiltEmailSentAt: null },
        data: { workshopBuiltEmailSentAt: new Date() },
    });
    if (emailClaimed > 0) {
        try {
            await sendWorkshopBuiltEmail({
                coachEmail: workshop.coach.email,
                coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
                workshopTitle: workshop.title,
                workshopId: workshop.id,
                pagesCreated: created,
                preEventWorkflow: preEventWorkflow?.name || null,
                postEventWorkflow: postEventWorkflow?.name || null,
            });
        } catch (e) {
            // SMTP failed after claim — clear so a future retry can re-attempt
            await db.workshop.update({
                where: { id: workshopId },
                data: { workshopBuiltEmailSentAt: null },
            });
            throw e;
        }
    }

    return {
        success: true,
        pagesCreated: created.length,
        templates: created,
        status: "PRE_EVENT",
        preEventWorkflow: preEventWorkflow?.name || null,
        postEventWorkflow: postEventWorkflow?.name || null,
    };
}

// --- Internal helpers ---

interface WorkshopForAssignment {
    id: string;
    workshopCode: string;
    format: string;
    workshopCategory: { id: string } | null;
}

async function assignWorkflow(
    workshop: WorkshopForAssignment,
    phase: "PRE_EVENT" | "POST_EVENT"
): Promise<{ name: string; assignmentId: string } | null> {
    // BUG-MAY6-2: Fetch all eligible templates (small cardinality), then rank
    // in code. The previous Prisma findFirst path treated categoryId as hard
    // equality (so wildcard-category workflows never matched a categoried
    // workshop) and relied on `orderBy: { workshopFormat: "desc" }` for
    // specificity — but Postgres' default null ordering for DESC is NULLS
    // FIRST, so wildcard format actually beat specific format. See
    // lib/workflows/find-auto-attach-workflow.ts.
    const candidates = await db.workflow.findMany({
        where: {
            isActive: true,
            isTemplate: true, // only auto-attach templates, never customized clones
            workflowPhase: phase,
        },
    });

    const workflow = findAutoAttachWorkflow(candidates, {
        workshopCategoryId: workshop.workshopCategory?.id ?? null,
        workshopFormat: workshop.format,
    });

    if (!workflow) return null;

    // Check if already assigned
    const existing = await db.workflowAssignment.findUnique({
        where: {
            workflowId_workshopId: {
                workflowId: workflow.id,
                workshopId: workshop.id,
            },
        },
    });

    if (existing) return { name: workflow.name, assignmentId: existing.id };

    const assignment = await db.workflowAssignment.create({
        data: {
            workflowId: workflow.id,
            workshopId: workshop.id,
            workshopCode: workshop.workshopCode,
            assignedBy: "AUTO_BUILD",
        },
    });

    // Trigger workflow execution (non-blocking — Inngest may not be available)
    try {
        await inngest.send({
            name: "workflow/schedule",
            data: { workshopId: workshop.id, workflowAssignmentId: assignment.id },
        });
    } catch (err) {
        console.error(`[auto-build-service] Failed to emit workflow/schedule for ${phase}:`, err);
    }

    return { name: workflow.name, assignmentId: assignment.id };
}
