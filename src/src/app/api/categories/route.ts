import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

/**
 * GET /api/categories
 * Returns active workshop categories with their pricing tiers.
 * Public endpoint (used by coach wizard).
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const includeInactive = searchParams.get("all") === "true";

        const categories = await db.category.findMany({
            where: includeInactive ? {} : { isActive: true },
            include: {
                pricingTiers: {
                    where: includeInactive ? {} : { isActive: true },
                    orderBy: { amountCents: "asc" },
                },
                _count: { select: { workshops: true } },
            },
            orderBy: { name: "asc" },
        });

        return NextResponse.json(categories);
    } catch (error) {
        console.error("Failed to fetch categories:", error);
        return NextResponse.json(
            { error: "Failed to fetch categories" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/categories
 * Create a new category. Admin only.
 */
export async function POST(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor || !isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const { name, description } = body;

        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const category = await db.category.create({
            data: {
                name: name.trim(),
                slug,
                description: description?.trim() || null,
            },
        });

        return NextResponse.json(category, { status: 201 });
    } catch (error) {
        console.error("Failed to create category:", error);
        if ((error as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}
