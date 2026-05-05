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
import { sendWorkshopBuiltEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";

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
        select: { id: true, templateType: true, content: true, categoryId: true, customCode: true },
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
            select: { id: true, templateType: true, content: true, categoryId: true, customCode: true },
        });
    }

    // Filter OUT corrupted templates (no placeholders = corrupted content)
    activeTemplates = activeTemplates.filter(tpl => {
        if (!templateHasPlaceholders(tpl.content)) {
            console.error(
                `[auto-build-service] SKIPPING PageTemplate ${tpl.id} (${tpl.templateType}) — no {{placeholders}}. ` +
                `Content may be corrupted. Re-run: npx tsx prisma/seed-templates.ts`
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

    // Step 4: Create landing pages
    const created: string[] = [];
    let primarySlug: string | null = null;

    for (const tpl of activeTemplates) {
        // Check if this workshop already has a page for this template type
        const existingPage = await db.landingPage.findUnique({
            where: {
                workshopId_template: {
                    workshopId: workshop.id,
                    template: tpl.templateType,
                },
            },
        });

        if (existingPage) continue; // Don't overwrite manually created pages

        // Interpolate variables in content
        const interpolatedContent = interpolateContent(tpl.content, variables);

        const remaining = findRemainingPlaceholders(interpolatedContent);
        if (remaining.length > 0) {
            console.warn(
                `[auto-build-service] ${tpl.templateType} has ${remaining.length} unresolved placeholders: ${remaining.join(', ')}`
            );
        }

        // Generate unique slug
        const base = workshop.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        const templateSuffix = tpl.templateType.toLowerCase().replace(/_/g, "-");
        const slug = `${base}-${templateSuffix}-${Date.now().toString(36)}`;

        await db.landingPage.create({
            data: {
                workshopId: workshop.id,
                template: tpl.templateType,
                slug,
                content: interpolatedContent,
                status: "PUBLISHED",
                publishedAt: new Date(),
                sourceTemplateId: tpl.id,
                // CHG-03: copy admin-blessed customCode through at build time.
                // Coach-accessible routes never accept customCode from request bodies.
                customCode: tpl.customCode ?? null,
            },
        });

        created.push(tpl.templateType);
        if (!primarySlug) primarySlug = slug;
    }

    // Step 4b: Link SOLO_LANDING registrationUrl → REGISTRATION page
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
    let landingPageSlug = primarySlug;
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
    const workflow = await db.workflow.findFirst({
        where: {
            isActive: true,
            workflowPhase: phase,
            ...(workshop.workshopCategory?.id ? { categoryId: workshop.workshopCategory.id } : {}),
            OR: [
                { workshopFormat: workshop.format },
                { workshopFormat: null },
            ],
        },
        orderBy: [
            { workshopFormat: "desc" },
            { updatedAt: "desc" },
        ],
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
