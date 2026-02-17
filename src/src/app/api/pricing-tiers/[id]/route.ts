import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

/**
 * PATCH /api/pricing-tiers/[id]
 * Update a pricing tier. Admin only.
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
        const { name, amountCents, description, isActive } = body;

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name.trim();
        if (amountCents !== undefined) data.amountCents = Math.round(amountCents);
        if (description !== undefined) data.description = description?.trim() || null;
        if (isActive !== undefined) data.isActive = Boolean(isActive);

        const tier = await db.pricingTier.update({
            where: { id },
            data,
            include: { category: { select: { id: true, name: true } } },
        });

        return NextResponse.json(tier);
    } catch (error) {
        console.error("Failed to update pricing tier:", error);
        if ((error as { code?: string }).code === "P2025") {
            return NextResponse.json({ error: "Pricing tier not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to update pricing tier" }, { status: 500 });
    }
}

/**
 * DELETE /api/pricing-tiers/[id]
 * Delete a pricing tier (only if no workshops reference it). Admin only.
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

        const workshopCount = await db.workshop.count({ where: { pricingTierId: id } });
        if (workshopCount > 0) {
            return NextResponse.json(
                { error: `Cannot delete: ${workshopCount} workshop(s) use this tier. Deactivate it instead.` },
                { status: 400 }
            );
        }

        await db.pricingTier.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete pricing tier:", error);
        if ((error as { code?: string }).code === "P2025") {
            return NextResponse.json({ error: "Pricing tier not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to delete pricing tier" }, { status: 500 });
    }
}
