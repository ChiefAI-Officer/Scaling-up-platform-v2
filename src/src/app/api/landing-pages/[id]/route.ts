import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";

const UpdateSchema = z.object({
    isActiveTemplate: z.boolean().optional(),
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

        const updated = await db.landingPage.update({
            where: { id },
            data: {
                ...(data.isActiveTemplate !== undefined && { isActiveTemplate: data.isActiveTemplate }),
            },
        });

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
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;

        const page = await db.landingPage.findUnique({ where: { id } });
        if (!page) {
            return NextResponse.json({ error: "Landing page not found" }, { status: 404 });
        }

        await db.landingPage.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Landing page DELETE error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
