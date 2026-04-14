import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { inngest } from "@/inngest/client";
import { runAutoBuild } from "@/lib/auto-build-service";
import { generateUniqueWorkshopCode } from "@/lib/workshops/workshop-code";
import { generateSlug } from "@/lib/utils";
import { sendEnrichedApprovalRequest } from "@/services/notifications";
import { verifyCertification } from "@/services/circle";
import { getCoachByEmail } from "@/services/hubspot";
import { validateLeadTime } from "@/lib/workshops/lead-time-validator";
import { getCoachBioMissingFields } from "@/lib/validations";

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
    customPricingNotes: z.string().optional(),
});

const APPROVAL_STATUSES = new Set(["PENDING", "APPROVED", "DENIED", "EXPIRED", "INFO_REQUESTED", "COUNTER_OFFERED"]);

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

    // Construct details from explicit field or from workshopTitle/workshopEventDate
    // (CUSTOM_PRICING approvals created via PATCH /api/workshops/[id] store these)
    let details: string | undefined;
    if (typeof data.details === "string") {
        details = data.details;
    } else if (typeof data.workshopTitle === "string" && data.workshopTitle) {
        const datePart = typeof data.workshopEventDate === "string"
            ? ` on ${new Date(data.workshopEventDate).toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" })}`
            : "";
        details = `Workshop: ${data.workshopTitle}${datePart}`;
    }

    return {
        details,
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
            where: includeAll ? {} : { status: status as "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "INFO_REQUESTED" | "COUNTER_OFFERED" },
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
                workshop: {
                    select: {
                        id: true,
                        title: true,
                        eventDate: true,
                        workshopCode: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: "asc" },
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
                    details: normalized.details
                        || (a.workshop?.title
                            ? `Workshop: ${a.workshop.title}${a.workshop.eventDate ? ` on ${new Date(a.workshop.eventDate).toLocaleDateString("en-US", { timeZone: "UTC" })}` : ""}`
                            : "Approval request submitted from coach portal"),
                    coachId: a.coachId,
                    workshopId: a.workshopId,
                    workshopCode: a.workshop?.workshopCode ?? null,
                    requestedAt: a.requestedAt,
                    escalatedAt: a.escalatedAt,
                    requestedBy: normalized.requestedBy || a.requestedBy || a.coach?.email || "unknown",
                    responseReason: a.responseReason,
                    coachResponse: a.coachResponse, // MR-33
                    counterOfferCents: a.counterOfferCents ?? null,
                    counterOfferNote: a.counterOfferNote ?? null,
                    notes: a.notes,
                    messages: (a.messages ?? []).map((m) => ({
                        id: m.id,
                        from: m.from,
                        text: m.text,
                        createdAt: m.createdAt.toISOString(),
                    })),
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

        // Fix #2: Validate coach bio completeness before allowing workshop request
        const coachBio = await db.coach.findUnique({
            where: { id: coachId },
            select: {
                firstName: true, lastName: true, email: true,
                title: true, linkedinUrl: true, bio: true, profileImage: true,
            },
        });
        if (!coachBio) {
            return NextResponse.json({ error: "Coach not found" }, { status: 404 });
        }
        const bioMissing = getCoachBioMissingFields(coachBio);
        if (bioMissing.length > 0) {
            return NextResponse.json({
                success: false,
                error: `Coach profile is incomplete. Missing: ${bioMissing.join(", ")}`,
                missingFields: bioMissing,
            }, { status: 400 });
        }

        // JV-20: For workshop requests, create the Workshop record first so it
        // appears in the coach's "My Workshops" list immediately.
        let workshopId: string | undefined = input.workshopId;
        let createdWorkshopCode: string | undefined;
        let requestedCustomPriceCents: number | null = null;

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

            // FIG-011: Virtual workshops must have a meeting link
            if (body.format === "VIRTUAL" && !body.virtualLink) {
                return NextResponse.json(
                    { error: "Meeting link is required for virtual workshops" },
                    { status: 400 }
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
            let tierAmountCents: number | null = null;
            if (body.pricingTierId) {
                const tier = await db.pricingTier.findUnique({ where: { id: body.pricingTierId } });
                if (tier) {
                    resolvedPricingTierId = tier.id;
                    tierAmountCents = tier.amountCents;
                }
            }

            // FIG-010: Resolve priceCents.
            // For CUSTOM_PRICING, the workshop is created at the tier price; the custom
            // override is stored as newPriceCents in the approval for admin to review.
            // For WORKSHOP_REQUEST with no custom price, use tier price directly.
            requestedCustomPriceCents =
                typeof body.customPrice === "number" && body.customPrice > 0
                    ? Math.round(body.customPrice * 100)
                    : null;

            const resolvedPriceCents: number =
                tierAmountCents !== null && tierAmountCents > 0
                    ? tierAmountCents
                    : requestedCustomPriceCents !== null
                        ? requestedCustomPriceCents
                        : 0;

            // Resolve the workshop title with category fallback
            const resolvedTitle = body.title || (resolvedCat ? (resolvedCat.defaultTitle || `Scaling Up ${resolvedCat.name}`) : "Workshop Request");

            const workshop = await db.workshop.create({
                data: {
                    coachId,
                    workshopTypeId: resolvedWorkshopTypeId,
                    workshopCode,
                    title: resolvedTitle,
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
                    virtualLink: body.virtualLink || null,
                    isFree: resolvedPriceCents === 0,
                    priceCents: resolvedPriceCents,
                    maxAttendees: body.maxAttendees || 30,
                    status: "INFO_REQUESTED",
                    termsAcceptedAt: body.termsAcceptedAt ? new Date(body.termsAcceptedAt) : null,
                },
            });

            workshopId = workshop.id;
            createdWorkshopCode = workshop.workshopCode;

            // Generate landing page slug using the resolved title
            const slug = generateSlug(resolvedTitle, workshop.id);
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
            customPricingNotes: input.customPricingNotes,
            newPriceCents: requestedCustomPriceCents ?? undefined,
            workshopCode: createdWorkshopCode,
        });

        // If auto-approved, run auto-build inline (creates pages, assigns workflows, advances status)
        if (result.autoApproved && workshopId) {
            await db.workshop.update({
                where: { id: workshopId },
                data: { status: "AWAITING_APPROVAL" },
            });

            try {
                const buildResult = await runAutoBuild(workshopId);
                console.log(`[AUTO-BUILD] Auto-approval inline build: pages=${buildResult.pagesCreated}`);
            } catch (err) {
                console.error("[AUTO-BUILD] Auto-approval inline build failed:", err);
            }

            // Keep Inngest as backup
            try {
                await inngest.send({
                    name: "workshop/approved",
                    data: { approvalId: result.approvalId || "", workshopId, coachId },
                });
            } catch (err) {
                console.error("[INNGEST] Backup event failed:", err);
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
            Promise.all([
                verifyCertification(coachEmail, workshopTypeSlug || "").catch(() => null),
                getCoachByEmail(coachEmail).catch(() => null),
            ]).then(([circleData, hubspotRaw]) => {
                const hsProps = (hubspotRaw as Record<string, unknown> | null)?.properties as Record<string, unknown> | undefined;
                sendEnrichedApprovalRequest({
                    approvalId: result.approvalId!,
                    type: input.type,
                    coachName,
                    coachEmail,
                    details,
                    requestedAt: new Date(),
                    amount: input.amount,
                    customPricingNotes: input.customPricingNotes,
                    circleCertification: circleData ? {
                        verified: circleData.verified,
                        confidence: circleData.confidence,
                        certificationDate: circleData.certificationDate ? String(circleData.certificationDate) : undefined,
                        issues: circleData.issues,
                    } : undefined,
                    hubspotStanding: hsProps ? {
                        paymentStatus: hsProps.coach_payment_status ? String(hsProps.coach_payment_status) : undefined,
                        territory: hsProps.coach_territory ? String(hsProps.coach_territory) : undefined,
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
