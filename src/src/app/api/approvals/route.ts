import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { inngest } from "@/inngest/client";
import { generateUniqueWorkshopCode } from "@/lib/workshop-code";
import { generateSlug } from "@/lib/utils";
import { sendEnrichedApprovalRequest } from "@/services/notifications";
import { verifyCertification } from "@/services/circle";
import { getCoachByEmail } from "@/services/hubspot";
import { validateLeadTime } from "@/lib/lead-time-validator";

// Request schemas
const CreateApprovalSchema = z.object({
    type: z.enum(["WORKSHOP_REQUEST", "CUSTOM_PRICING", "CANCELLATION", "DATE_CHANGE", "REFUND"]),
    coachId: z.string().optional(),
    coachEmail: z.string().email().optional(),
    workshopId: z.string().optional(),
    workshopTypeSlug: z.string().optional(),
    workshopTypeId: z.string().optional(),
    amount: z.number().optional(),
    details: z.string().optional(),
    requestedBy: z.string().optional(),
    title: z.string().optional(),
    eventDate: z.string().optional(),
});

const APPROVAL_STATUSES = new Set(["PENDING", "APPROVED", "DENIED", "EXPIRED"]);

function safeJsonParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

type ApprovalRequestData = {
    details?: string;
    requestedBy?: string;
};

function normalizeRequestData(raw: unknown): ApprovalRequestData {
    if (!raw || typeof raw !== "object") {
        return {};
    }

    const data = raw as Record<string, unknown>;
    return {
        details: typeof data.details === "string" ? data.details : undefined,
        requestedBy: typeof data.requestedBy === "string" ? data.requestedBy : undefined,
    };
}

async function publishApprovalRequestedEvent(
    approvalId: string,
    type: string,
    coachId: string
) {
    if (process.env.NODE_ENV === "test" || !process.env.INNGEST_EVENT_KEY) {
        return;
    }

    try {
        await inngest.send({
            name: "approval/requested",
            data: {
                approvalId,
                type,
                coachId,
            },
        });
    } catch (error) {
        // Do not block user flow if async telemetry fails.
        console.error("Failed to publish approval/requested event:", error);
    }
}

function buildDetails(input: z.infer<typeof CreateApprovalSchema>): string {
    if (input.details && input.details.trim().length > 0) {
        return input.details.trim();
    }

    const title = input.title?.trim();
    const date = input.eventDate?.trim();

    if (title && date) {
        return `Workshop: ${title} on ${date}`;
    }

    if (title) {
        return `Workshop: ${title}`;
    }

    return "Approval request submitted from coach portal";
}

function parseEventDate(value: unknown): Date | null {
    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET /api/approvals
 * List pending approvals (for admin dashboard)
 */
export async function GET(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const rawStatus = (searchParams.get("status") || "PENDING").toUpperCase();
        const includeAll = rawStatus === "ALL";
        const status = APPROVAL_STATUSES.has(rawStatus) ? rawStatus : "PENDING";
        const parsedLimit = parseInt(searchParams.get("limit") || "50", 10);
        const limit =
            Number.isFinite(parsedLimit) && parsedLimit > 0
                ? Math.min(100, parsedLimit)
                : 50;

        const approvals = await db.approvalQueue.findMany({
            where: includeAll ? {} : { status: status as "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" },
            orderBy: { requestedAt: "desc" },
            take: limit,
            include: {
                coach: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json({
            approvals: approvals.map((a) => {
                const requestData = safeJsonParse(a.requestData);
                const normalized = normalizeRequestData(requestData);
                const coachName = a.coach
                    ? `${a.coach.firstName} ${a.coach.lastName}`.trim() || a.coach.email
                    : normalized.requestedBy || a.requestedBy || "Unknown Coach";

                return {
                    id: a.id,
                    type: a.type,
                    status: a.status,
                    requestData,
                    coachName,
                    details: normalized.details || "Approval request submitted from coach portal",
                    coachId: a.coachId,
                    workshopId: a.workshopId,
                    requestedAt: a.requestedAt,
                    escalatedAt: a.escalatedAt,
                    requestedBy: normalized.requestedBy || a.requestedBy || a.coach?.email || "unknown",
                    responseReason: a.responseReason,
                    coachResponse: a.coachResponse, // MR-33
                };
            }),
            total: approvals.length,
        });
    } catch (error) {
        console.error("Approvals GET error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/approvals
 * Create a new approval request
 */
export async function POST(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const input = CreateApprovalSchema.parse(body);
        const workshopTypeSlug = input.workshopTypeSlug || input.workshopTypeId;
        const details = buildDetails(input);

        let coachId: string;
        let coachEmail: string;
        let requestedBy: string;

        if (actor.role === "COACH") {
            if (!actor.coachId) {
                return NextResponse.json(
                    { error: "Coach profile not found for authenticated user" },
                    { status: 403 }
                );
            }

            if (input.coachId && input.coachId !== actor.coachId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            if (input.coachEmail && input.coachEmail.toLowerCase() !== actor.email.toLowerCase()) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            coachId = actor.coachId;
            coachEmail = actor.email;
            requestedBy = input.requestedBy || actor.email;
        } else {
            if (!isPrivilegedRole(actor.role)) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            if (!input.coachId || !input.coachEmail) {
                return NextResponse.json(
                    { error: "coachId and coachEmail are required for admin/staff approval requests" },
                    { status: 400 }
                );
            }

            coachId = input.coachId;
            coachEmail = input.coachEmail.toLowerCase();
            requestedBy = input.requestedBy || actor.email;
        }

        // JV-20: For workshop requests, create the Workshop record first so it
        // appears in the coach's "My Workshops" list immediately.
        let workshopId: string | undefined = input.workshopId;

        if (
            (input.type === "WORKSHOP_REQUEST" || input.type === "CUSTOM_PRICING") &&
            !workshopId
        ) {
            const requestedEventDate = parseEventDate(body.eventDate);
            if (!requestedEventDate) {
                return NextResponse.json(
                    { error: "A valid eventDate is required for workshop requests" },
                    { status: 400 }
                );
            }

            const leadTimeValidation = validateLeadTime(
                requestedEventDate,
                typeof body.format === "string" ? body.format : undefined
            );
            if (!leadTimeValidation.valid) {
                return NextResponse.json(
                    {
                        error: leadTimeValidation.reason || "Invalid event date",
                        requiresApproval: leadTimeValidation.requiresApproval,
                        leadTimeDays: leadTimeValidation.leadTimeDays,
                        requiredLeadTimeDays: leadTimeValidation.requiredLeadTimeDays,
                    },
                    { status: leadTimeValidation.requiresApproval ? 409 : 400 }
                );
            }

            // Resolve workshopTypeId from slug or ID
            let resolvedWorkshopTypeId: string | undefined;
            if (workshopTypeSlug) {
                const wt = await db.workshopType.findFirst({
                    where: {
                        OR: [{ slug: workshopTypeSlug }, { id: workshopTypeSlug }],
                    },
                    select: { id: true },
                });
                resolvedWorkshopTypeId = wt?.id;
            }

            // Generate unique workshop code (JV-03)
            const workshopCode = await generateUniqueWorkshopCode(
                async (code) =>
                    !!(await db.workshop.findUnique({
                        where: { workshopCode: code },
                        select: { id: true },
                    }))
            );

            // Extract form fields from the raw body (wizard sends all form data)
            const venueAddress =
                body.venueAddress || body.venueCity
                    ? JSON.stringify({
                          street: body.venueAddress || "",
                          city: body.venueCity || "",
                          state: body.venueState || "",
                          zip: body.venueZip || "",
                      })
                    : null;

            const priceCents =
                typeof body.customPrice === "number" && body.customPrice > 0
                    ? Math.round(body.customPrice * 100)
                    : undefined;

            // JV-16: Resolve category from categoryId
            let resolvedCategoryId: string | null = null;
            let category: "AI" | "EXIT_AND_VALUATION" = "AI";
            let resolvedCat: { id: string; name: string; slug: string; defaultTitle: string | null } | null = null;
            if (body.categoryId) {
                const cat = await db.category.findUnique({ where: { id: body.categoryId } });
                if (cat) {
                    resolvedCat = cat;
                    resolvedCategoryId = cat.id;
                    category = cat.slug.includes("exit") || cat.slug.includes("valuation")
                        ? "EXIT_AND_VALUATION" : "AI";
                }
            }

            // JV-17: Resolve pricing tier
            let resolvedPricingTierId: string | null = null;
            if (body.pricingTierId) {
                const tier = await db.pricingTier.findUnique({ where: { id: body.pricingTierId } });
                if (tier) {
                    resolvedPricingTierId = tier.id;
                }
            }

            const workshop = await db.workshop.create({
                data: {
                    coachId,
                    workshopTypeId: resolvedWorkshopTypeId,
                    workshopCode,
                    title: body.title || (resolvedCat ? (resolvedCat.defaultTitle || `Scaling Up ${resolvedCat.name}`) : `Workshop Request`),
                    description: body.description || details,
                    category,
                    categoryId: resolvedCategoryId,
                    pricingTierId: resolvedPricingTierId,
                    format: body.format || "IN_PERSON",
                    duration: body.duration || "full-day",
                    eventDate: requestedEventDate,
                    eventTime: body.eventTime || "09:00",
                    timezone: body.timezone || "America/New_York",
                    venueName: body.venueName || null,
                    venueAddress,
                    isFree: !priceCents,
                    priceCents,
                    maxAttendees: body.maxAttendees || 30,
                    status: "INFO_REQUESTED",
                    termsAcceptedAt: body.termsAcceptedAt ? new Date(body.termsAcceptedAt) : null,
                },
            });

            workshopId = workshop.id;

            // Generate landing page slug
            const slug = generateSlug(body.title || "workshop", workshop.id);
            await db.workshop.update({
                where: { id: workshop.id },
                data: { landingPageSlug: slug },
            });
        }

        // Evaluate the approval (may auto-approve or create queue entry)
        const result = await evaluateApproval({
            type: input.type as ApprovalType,
            coachId,
            coachEmail,
            workshopId,
            workshopTypeSlug,
            amount: input.amount,
            details,
            requestedBy,
        });

        // If auto-approved, advance workshop status and trigger auto-build
        if (result.autoApproved && workshopId) {
            await db.workshop.update({
                where: { id: workshopId },
                data: { status: "AWAITING_APPROVAL" },
            });

            try {
                await inngest.send({
                    name: "workshop/approved",
                    data: { approvalId: result.approvalId || "", workshopId, coachId },
                });
                console.log(`[INNGEST] workshop/approved event sent (auto-approved) for workshop=${workshopId}`);
            } catch (err) {
                console.error("[INNGEST] Failed to emit workshop/approved (auto-approved):", err);
            }
        }

        if (!result.autoApproved && result.approvalId) {
            await publishApprovalRequestedEvent(result.approvalId, input.type, coachId);

            // JV-29: Send enriched approval email with Circle/HubSpot data (fire-and-forget)
            const coachRecord = await db.coach.findFirst({
                where: { id: coachId },
                select: { firstName: true, lastName: true, email: true },
            });
            const coachName = coachRecord
                ? `${coachRecord.firstName} ${coachRecord.lastName}`
                : requestedBy;

            // Fetch enrichment data in parallel (non-blocking)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Promise.all([
                verifyCertification(coachEmail, workshopTypeSlug || "").catch(() => null),
                getCoachByEmail(coachEmail).catch(() => null),
            ]).then(([circleData, hubspotRaw]) => {
                const hsProps = (hubspotRaw as any)?.properties;
                sendEnrichedApprovalRequest({
                    approvalId: result.approvalId!,
                    type: input.type,
                    coachName,
                    coachEmail,
                    details,
                    requestedAt: new Date(),
                    amount: input.amount,
                    circleCertification: circleData ? {
                        verified: circleData.verified,
                        confidence: circleData.confidence,
                        certificationDate: circleData.certificationDate ? String(circleData.certificationDate) : undefined,
                        issues: circleData.issues,
                    } : undefined,
                    hubspotStanding: hsProps ? {
                        paymentStatus: hsProps.coach_payment_status || undefined,
                        territory: hsProps.coach_territory || undefined,
                    } : undefined,
                }).catch((err: unknown) => console.error("Enriched approval email failed:", err));
            }).catch((err: unknown) => console.error("Enrichment data fetch failed:", err));
        }

        return NextResponse.json({
            success: true,
            autoApproved: result.autoApproved,
            reason: result.reason,
            approvalId: result.approvalId,
            routedTo: result.routeTo,
            workshopId,
        });
    } catch (error) {
        console.error("Approvals POST error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation error", details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
