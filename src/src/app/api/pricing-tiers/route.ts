import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { z } from "zod";

const pricingTierQuerySchema = z.object({
    categoryId: z.string().min(1).optional(),
    all: z.enum(["true", "false"]).optional(),
});

const createPricingTierSchema = z.object({
    categoryId: z.string().min(1, "categoryId is required"),
    name: z.string().trim().min(1, "name is required"),
    amountCents: z.coerce.number().int().min(0, "amountCents must be non-negative"),
    description: z.string().trim().optional().nullable(),
});

/**
 * GET /api/pricing-tiers
 * Returns pricing tiers, optionally filtered by category.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const queryValidation = pricingTierQuerySchema.safeParse(
            Object.fromEntries(searchParams.entries())
        );

        if (!queryValidation.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", details: queryValidation.error.issues },
                { status: 400 }
            );
        }

        const categoryId = queryValidation.data.categoryId;
        const includeInactive = queryValidation.data.all === "true";

        const tiers = await db.pricingTier.findMany({
            where: {
                ...(categoryId ? { categoryId } : {}),
                ...(includeInactive ? {} : { isActive: true }),
            },
            include: {
                category: { select: { id: true, name: true } },
                _count: { select: { workshops: true } },
            },
            orderBy: [{ category: { name: "asc" } }, { amountCents: "asc" }],
        });

        return NextResponse.json(tiers);
    } catch (error) {
        console.error("Failed to fetch pricing tiers:", error);
        return NextResponse.json({ error: "Failed to fetch pricing tiers" }, { status: 500 });
    }
}

/**
 * POST /api/pricing-tiers
 * Create a new pricing tier. Admin only.
 */
export async function POST(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor || !isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const bodyValidation = createPricingTierSchema.safeParse(await request.json());
        if (!bodyValidation.success) {
            return NextResponse.json(
                { error: "Invalid request body", details: bodyValidation.error.issues },
                { status: 400 }
            );
        }

        const { categoryId, name, amountCents, description } = bodyValidation.data;

        const tier = await db.pricingTier.create({
            data: {
                categoryId,
                name: name.trim(),
                amountCents: Math.round(amountCents),
                description: description?.trim() || null,
            },
            include: { category: { select: { id: true, name: true } } },
        });

        return NextResponse.json(tier, { status: 201 });
    } catch (error) {
        console.error("Failed to create pricing tier:", error);
        return NextResponse.json({ error: "Failed to create pricing tier" }, { status: 500 });
    }
}
