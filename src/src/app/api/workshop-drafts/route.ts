import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { NextResponse } from "next/server";
import { z } from "zod";

const draftSchema = z.object({
    step: z.number(),
    data: z.any(), // Flexible JSON data for form state
});

/**
 * GET /api/workshop-drafts
 * Retrieve the current user's active workshop draft
 */
export async function GET() {
    try {
        const { session } = await requireCoach();

        // Find most recent draft for this user
        const draft = await db.workshopDraft.findFirst({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
        });

        if (!draft) {
            return NextResponse.json({ currentStep: 1, stepsData: "{}" });
        }

        return NextResponse.json(draft);
    } catch (error) {
        console.error("Error fetching draft:", error);
        return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
    }
}

/**
 * POST /api/workshop-drafts
 * Create or update the workshop draft
 */
export async function POST(req: Request) {
    try {
        const { session } = await requireCoach();
        const body = await req.json();

        const validation = draftSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: "Invalid draft data" }, { status: 400 });
        }

        const { step, data } = validation.data;

        // Check for existing draft
        const existingDraft = await db.workshopDraft.findFirst({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
        });

        let draft;

        if (existingDraft) {
            draft = await db.workshopDraft.update({
                where: { id: existingDraft.id },
                data: {
                    currentStep: step,
                    stepsData: JSON.stringify(data),
                    updatedAt: new Date()
                }
            });
        } else {
            draft = await db.workshopDraft.create({
                data: {
                    userId: session.user.id,
                    currentStep: step,
                    stepsData: JSON.stringify(data)
                }
            });
        }

        return NextResponse.json({ success: true, draftId: draft.id });
    } catch (error) {
        console.error("Error saving draft:", error);
        return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
    }
}
