import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

/**
 * GET /api/pricing-tiers
 * Returns pricing tiers, optionally filtered by category.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get("categoryId");
        const includeInactive = searchParams.get("all") === "true";

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

        const body = await request.json();
        const { categoryId, name, amountCents, description } = body;

        if (!categoryId || !name || amountCents === undefined) {
            return NextResponse.json(
                { error: "categoryId, name, and amountCents are required" },
                { status: 400 }
            );
        }

        if (typeof amountCents !== "number" || amountCents < 0) {
            return NextResponse.json({ error: "amountCents must be a non-negative number" }, { status: 400 });
        }

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
