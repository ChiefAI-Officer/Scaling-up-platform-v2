import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { LandingPage } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

const UpdateSchema = z.object({
    isActiveTemplate: z.boolean().optional(),
    categoryId: z.string().nullable().optional(),  // allow re-scoping page to a specific category
});

/**
 * PATCH /api/landing-pages/[id]
 * Update landing page properties (admin only)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const data = UpdateSchema.parse(body);

        const page = await db.landingPage.findUnique({ where: { id } });
        if (!page) {
            return NextResponse.json({ error: "Landing page not found" }, { status: 404 });
        }

        // Should we run the deactivation transaction?
        // Yes if: we're activating this page, OR we're re-scoping an already-active page to a new slot.
        const needsTransaction =
            data.isActiveTemplate === true ||
            (data.categoryId !== undefined && page.isActiveTemplate && data.isActiveTemplate !== false);

        let updated: LandingPage;

        if (needsTransaction) {
            // Determine the effective categoryId for the slot
            // (use data.categoryId if explicitly provided, otherwise use the page's existing categoryId)
            const effectiveCategoryId = data.categoryId !== undefined ? data.categoryId : page.categoryId;

            // Atomic: deactivate any competing active template for this slot, then activate this one
            const txResult = await db.$transaction<[Prisma.BatchPayload, LandingPage]>([
                db.landingPage.updateMany({
                    where: {
                        template: page.template,
                        categoryId: effectiveCategoryId,  // null = global slot
                        isActiveTemplate: true,
                        id: { not: id },
                    },
                    data: { isActiveTemplate: false },
                }),
                db.landingPage.update({
                    where: { id },
                    data: {
                        ...(data.isActiveTemplate !== undefined && { isActiveTemplate: data.isActiveTemplate }),
                        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                    },
                }),
            ]);
            updated = txResult[1];
        } else {
            updated = await db.landingPage.update({
                where: { id },
                data: {
                    ...(data.isActiveTemplate !== undefined && { isActiveTemplate: data.isActiveTemplate }),
                    ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                },
            });
        }

        return NextResponse.json({ success: true, page: updated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
        }
        console.error("Landing page PATCH error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE /api/landing-pages/[id]
 * Delete a landing page (admin only) — MR-27
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        if (!isPrivilegedRole(actor.role)) {
            // Return 404 to avoid leaking page existence to non-admin users.
            return NextResponse.json({ error: "Landing page not found" }, { status: 404 });
        }

        const { id } = await params;

        const page = await db.landingPage.findUnique({ where: { id } });
        if (!page) {
            return NextResponse.json({ error: "Landing page not found" }, { status: 404 });
        }

        if (page.isActiveTemplate) {
            return NextResponse.json(
                {
                    error: "Active template pages cannot be deleted. Disable Auto-Build on the page first.",
                },
                { status: 409 }
            );
        }

        await db.landingPage.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Landing page DELETE error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
