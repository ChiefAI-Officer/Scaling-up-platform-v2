import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { CERTIFIED_STATUS, PENDING_STATUS } from "@/lib/auth/coach-status";

const AddCertificationSchema = z.object({
    workshopTypeId: z.string().min(1),
    expiresAt: z.string().optional(),
});

/**
 * POST /api/coaches/[id]/certifications
 * Grant a workshop type certification to a coach
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
        }
        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }

        const { id: coachId } = await params;
        const body = await request.json();
        const validation = AddCertificationSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { success: false, error: "Validation error", details: validation.error.issues },
                { status: 400 }
            );
        }

        const { workshopTypeId, expiresAt } = validation.data;

        // Verify coach exists
        const coach = await db.coach.findUnique({
            where: { id: coachId },
            select: { id: true, certificationStatus: true },
        });
        if (!coach) {
            return NextResponse.json({ success: false, error: "Coach not found" }, { status: 404 });
        }

        // Verify workshop type exists
        const workshopType = await db.workshopType.findUnique({ where: { id: workshopTypeId }, select: { id: true } });
        if (!workshopType) {
            return NextResponse.json({ success: false, error: "Workshop type not found" }, { status: 404 });
        }

        // Check for duplicate
        const existing = await db.coachCertification.findUnique({
            where: { coachId_workshopTypeId: { coachId, workshopTypeId } },
        });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Coach already has this certification" },
                { status: 409 }
            );
        }

        const certCreateArgs = {
            data: {
                coachId,
                workshopTypeId,
                status: "ACTIVE",
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            },
            include: { workshopType: true },
        };

        // Auto-promote PENDING coaches to ACTIVE on cert grant so the overall
        // certification badge tracks the granted workshop-type certs. Only PENDING
        // is promoted — DEACTIVATED requires explicit reactivation by an admin.
        if (coach.certificationStatus === PENDING_STATUS) {
            const [certification] = await db.$transaction([
                db.coachCertification.create(certCreateArgs),
                db.coach.update({
                    where: { id: coachId },
                    data: { certificationStatus: CERTIFIED_STATUS },
                }),
            ]);
            return NextResponse.json({ success: true, data: certification }, { status: 201 });
        }

        const certification = await db.coachCertification.create(certCreateArgs);
        return NextResponse.json({ success: true, data: certification }, { status: 201 });
    } catch (error) {
        console.error("Error adding certification:", error);
        return NextResponse.json({ success: false, error: "Failed to add certification" }, { status: 500 });
    }
}

/**
 * DELETE /api/coaches/[id]/certifications?certificationId=xxx
 * Remove a certification from a coach
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
        }
        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }

        const { id: coachId } = await params;
        const { searchParams } = new URL(request.url);
        const certificationId = searchParams.get("certificationId");

        if (!certificationId) {
            return NextResponse.json(
                { success: false, error: "certificationId query parameter is required" },
                { status: 400 }
            );
        }

        // Verify certification exists and belongs to this coach
        const certification = await db.coachCertification.findUnique({
            where: { id: certificationId },
        });

        if (!certification || certification.coachId !== coachId) {
            return NextResponse.json({ success: false, error: "Certification not found" }, { status: 404 });
        }

        await db.coachCertification.delete({ where: { id: certificationId } });

        return NextResponse.json({ success: true, message: "Certification removed" });
    } catch (error) {
        console.error("Error removing certification:", error);
        return NextResponse.json({ success: false, error: "Failed to remove certification" }, { status: 500 });
    }
}
