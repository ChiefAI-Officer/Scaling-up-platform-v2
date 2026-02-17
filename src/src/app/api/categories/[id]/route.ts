import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

/**
 * PATCH /api/categories/[id]
 * Update a category. Admin only.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor || !isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const { name, description, isActive } = body;

        const data: Record<string, unknown> = {};
        if (name !== undefined) {
            data.name = name.trim();
            data.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        }
        if (description !== undefined) data.description = description?.trim() || null;
        if (isActive !== undefined) data.isActive = Boolean(isActive);

        const category = await db.category.update({
            where: { id },
            data,
        });

        return NextResponse.json(category);
    } catch (error) {
        console.error("Failed to update category:", error);
        if ((error as { code?: string }).code === "P2025") {
            return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }
        if ((error as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
    }
}

/**
 * DELETE /api/categories/[id]
 * Delete a category (only if no workshops use it). Admin only.
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor || !isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;

        // Check for linked workshops
        const workshopCount = await db.workshop.count({ where: { categoryId: id } });
        if (workshopCount > 0) {
            return NextResponse.json(
                { error: `Cannot delete: ${workshopCount} workshop(s) use this category. Deactivate it instead.` },
                { status: 400 }
            );
        }

        await db.category.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete category:", error);
        if ((error as { code?: string }).code === "P2025") {
            return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
    }
}
