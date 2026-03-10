/**
 * Auto-Build Workshop on Approval (Sprint 5 Flagship)
 *
 * Triggered when a workshop is approved. Automatically:
 * 1. Creates landing pages from active templates
 * 2. Assigns matching workflows (PRE_EVENT + POST_EVENT)
 * 3. Advances workshop status to PRE_EVENT
 * 4. Sends "workshop built" notification email to coach
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { interpolateContent } from "@/lib/template-interpolation";
import { sendWorkshopBuiltEmail } from "@/services/notifications";

interface WorkshopData {
    id: string;
    title: string;
    description: string | null;
    format: string;
    workshopCode: string;
    eventDate: string;
    eventTime: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueInstructions: string | null;
    virtualLink: string | null;
    isFree: boolean;
    priceCents: number | null;
    categoryId: string | null;
    coach: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        bio: string | null;
        profileImage: string | null;
        company: string | null;
    };
    category: { id: string; name: string; slug: string } | null;
    pricingTier: { name: string; amountCents: number } | null;
}

export const autoBuildWorkshop = inngest.createFunction(
    { id: "auto-build-workshop", retries: 2 },
    { event: "workshop/approved" },
    async ({ event, step }) => {
        const { workshopId } = event.data;

        // Idempotency guard: skip if workshop has already been built (e.g. Inngest retry)
        const idempotencyResult = await step.run("idempotency-check", async () => {
            const existingPages = await db.landingPage.findMany({
                where: { workshopId },
                select: { id: true },
            });
            const ws = await db.workshop.findUnique({
                where: { id: workshopId },
                select: { status: true },
            });

            const pageCount = existingPages.length;
            const status = ws?.status ?? "NOT_FOUND";
            const statusAlreadyAdvanced = status === "PRE_EVENT" || status === "POST_EVENT" || status === "COMPLETED";

            if (pageCount > 0 || statusAlreadyAdvanced) {
                console.warn(
                    `[auto-build] SKIP workshopId=${workshopId} pages=${pageCount} status=${status}`
                );
                return { skip: true, pageCount, status };
            }

            console.log(
                `[auto-build] PROCEED workshopId=${workshopId} pages=${pageCount} status=${status}`
            );
            return { skip: false, pageCount, status };
        });

        if (idempotencyResult.skip) {
            return {
                workshopId,
                skipped: true,
                reason: `Idempotency guard: pages=${idempotencyResult.pageCount}, status=${idempotencyResult.status}`,
            };
        }

        // Step 1: Fetch workshop + coach + category
        const workshop = await step.run("fetch-workshop", async (): Promise<WorkshopData> => {
            const w = await db.workshop.findUnique({
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
            if (!w) throw new Error(`Workshop ${workshopId} not found`);
            // Return plain object — Inngest step.run serializes to JSON
            return {
                id: w.id,
                title: w.title,
                description: w.description,
                format: w.format,
                workshopCode: w.workshopCode,
                eventDate: w.eventDate.toISOString(),
                eventTime: w.eventTime,
                venueName: w.venueName,
                venueAddress: w.venueAddress,
                venueInstructions: w.venueInstructions,
                virtualLink: w.virtualLink,
                isFree: w.isFree,
                priceCents: w.priceCents,
                categoryId: w.categoryId,
                coach: w.coach,
                category: w.workshopCategory,
                pricingTier: w.pricingTier,
            };
        });

        // Build template variables for interpolation
        const variables: Record<string, string> = {
            workshop_title: workshop.title,
            workshop_description: workshop.description || "",
            workshop_date: new Date(workshop.eventDate).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
            }),
            workshop_time: workshop.eventTime || "",
            workshop_format: workshop.format,
            workshop_code: workshop.workshopCode,
            venue_name: workshop.venueName || "",
            venue_address: workshop.venueAddress || "",
            venue_instructions: workshop.venueInstructions || "",
            virtual_link: workshop.virtualLink || "",
            coach_name: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
            coach_first_name: workshop.coach.firstName,
            coach_last_name: workshop.coach.lastName,
            coach_bio: workshop.coach.bio || "",
            coach_company: workshop.coach.company || "",
            coach_photo: workshop.coach.profileImage || "",
            category_name: workshop.category?.name || "",
            price: workshop.pricingTier
                ? `$${(workshop.pricingTier.amountCents / 100).toFixed(0)}`
                : workshop.isFree
                    ? "Free"
                    : workshop.priceCents
                        ? `$${(workshop.priceCents / 100).toFixed(0)}`
                        : "TBD",
        };

        // Step 2: Find and copy active templates
        const pagesCreated = await step.run("create-landing-pages", async () => {
            const activeTemplates = await db.landingPage.findMany({
                where: { isActiveTemplate: true },
                select: { id: true, template: true, content: true, slug: true },
            });

            if (activeTemplates.length === 0) {
                console.warn(
                    `[auto-build] WARNING: No active templates found for workshopId=${workshop.id}. ` +
                    `Workshop will proceed without landing pages. Set isActiveTemplate=true on at least one landing page template.`
                );
                return { count: 0, templates: [] as string[], noTemplatesAvailable: true };
            }

            const created: string[] = [];

            for (const tpl of activeTemplates) {
                // Check if this workshop already has a page for this template type
                const existing = await db.landingPage.findUnique({
                    where: {
                        workshopId_template: {
                            workshopId: workshop.id,
                            template: tpl.template,
                        },
                    },
                });

                if (existing) continue; // Don't overwrite manually created pages

                // Interpolate variables in content
                const interpolatedContent = interpolateContent(tpl.content, variables);

                // Generate unique slug
                const base = workshop.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "");
                const templateSuffix = tpl.template.toLowerCase().replace(/_/g, "-");
                const slug = `${base}-${templateSuffix}-${Date.now().toString(36)}`;

                await db.landingPage.create({
                    data: {
                        workshopId: workshop.id,
                        template: tpl.template,
                        slug,
                        content: interpolatedContent,
                        status: "DRAFT",
                    },
                });

                created.push(tpl.template);
            }

            return { count: created.length, templates: created };
        });

        // Step 3: Assign matching workflows (PRE_EVENT)
        const preEventAssigned = await step.run("assign-pre-event-workflow", async () => {
            const workflow_ = await db.workflow.findFirst({
                where: {
                    isActive: true,
                    workflowPhase: "PRE_EVENT",
                    ...(workshop.category?.id ? { categoryId: workshop.category.id } : {}),
                    OR: [
                        { workshopFormat: workshop.format },
                        { workshopFormat: null }, // Null means "any format"
                    ],
                },
                orderBy: [
                    // Prefer exact format match over wildcard
                    { workshopFormat: "desc" },
                    { updatedAt: "desc" },
                ],
            });

            if (!workflow_) return null;

            // Check if already assigned
            const existing = await db.workflowAssignment.findUnique({
                where: {
                    workflowId_workshopId: {
                        workflowId: workflow_.id,
                        workshopId: workshop.id,
                    },
                },
            });

            if (existing) return { workflowId: workflow_.id, name: workflow_.name, alreadyAssigned: true };

            const assignment = await db.workflowAssignment.create({
                data: {
                    workflowId: workflow_.id,
                    workshopId: workshop.id,
                    workshopCode: workshop.workshopCode,
                    assignedBy: "AUTO_BUILD",
                },
            });

            // Trigger workflow execution
            await inngest.send({
                name: "workflow/schedule",
                data: { workshopId: workshop.id, workflowAssignmentId: assignment.id },
            });

            return { workflowId: workflow_.id, name: workflow_.name, assignmentId: assignment.id };
        });

        // Step 4: Assign matching workflows (POST_EVENT)
        const postEventAssigned = await step.run("assign-post-event-workflow", async () => {
            const workflow_ = await db.workflow.findFirst({
                where: {
                    isActive: true,
                    workflowPhase: "POST_EVENT",
                    ...(workshop.category?.id ? { categoryId: workshop.category.id } : {}),
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

            if (!workflow_) return null;

            const existing = await db.workflowAssignment.findUnique({
                where: {
                    workflowId_workshopId: {
                        workflowId: workflow_.id,
                        workshopId: workshop.id,
                    },
                },
            });

            if (existing) return { workflowId: workflow_.id, name: workflow_.name, alreadyAssigned: true };

            const assignment = await db.workflowAssignment.create({
                data: {
                    workflowId: workflow_.id,
                    workshopId: workshop.id,
                    workshopCode: workshop.workshopCode,
                    assignedBy: "AUTO_BUILD",
                },
            });

            // Trigger workflow execution (will sleep until post-event date)
            await inngest.send({
                name: "workflow/schedule",
                data: { workshopId: workshop.id, workflowAssignmentId: assignment.id },
            });

            return { workflowId: workflow_.id, name: workflow_.name, assignmentId: assignment.id };
        });

        // Step 5: Update workshop status to PRE_EVENT
        await step.run("update-status", async () => {
            await db.workshop.update({
                where: { id: workshopId },
                data: { status: "PRE_EVENT" },
            });
        });

        // Step 6: Send "workshop built" email to coach
        await step.run("notify-coach", async () => {
            await sendWorkshopBuiltEmail({
                coachEmail: workshop.coach.email,
                coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
                workshopTitle: workshop.title,
                workshopId: workshop.id,
                pagesCreated: pagesCreated.templates,
                preEventWorkflow: preEventAssigned?.name || null,
                postEventWorkflow: postEventAssigned?.name || null,
            });
        });

        return {
            workshopId,
            pagesCreated: pagesCreated.count,
            noTemplatesAvailable: "noTemplatesAvailable" in pagesCreated && pagesCreated.noTemplatesAvailable === true,
            preEventWorkflow: preEventAssigned?.name || null,
            postEventWorkflow: postEventAssigned?.name || null,
            status: "PRE_EVENT",
        };
    }
);
