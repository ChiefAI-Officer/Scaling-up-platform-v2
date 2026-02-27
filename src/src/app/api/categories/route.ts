import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { z } from "zod";

const categoriesQuerySchema = z.object({
    all: z.enum(["true", "false"]).optional(),
});

const createCategorySchema = z.object({
    name: z.string().trim().min(1, "Name is required"),
    description: z.string().trim().optional().nullable(),
    defaultTitle: z.string().trim().optional().nullable(),
    defaultDescription: z.string().trim().optional().nullable(),
});

/**
 * GET /api/categories
 * Returns active workshop categories with their pricing tiers.
 * Public endpoint (used by coach wizard).
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const queryValidation = categoriesQuerySchema.safeParse(
            Object.fromEntries(searchParams.entries())
        );

        if (!queryValidation.success) {
            return NextResponse.json(
                { error: "Invalid query parameters", details: queryValidation.error.issues },
                { status: 400 }
            );
        }

        const includeInactive = queryValidation.data.all === "true";

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

        const bodyValidation = createCategorySchema.safeParse(await request.json());

        if (!bodyValidation.success) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const { name, description, defaultTitle, defaultDescription } = bodyValidation.data;

        const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const category = await db.category.create({
            data: {
                name: name.trim(),
                slug,
                description: description?.trim() || null,
                defaultTitle: defaultTitle?.trim() || null,
                defaultDescription: defaultDescription?.trim() || null,
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
