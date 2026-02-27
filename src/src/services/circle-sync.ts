import { db } from "@/lib/db";
import { getCircleProfileByEmail } from "@/services/circle";

export interface SyncOptions {
    forceOverwrite?: boolean;
}

export interface SyncResult {
    success: boolean;
    updated: boolean;
    fieldsUpdated: string[];
    error?: string;
}

/**
 * Sync a coach's profile data from Circle.so into the Coach record.
 *
 * By default, only fills empty fields (bio, profileImage, company).
 * Pass forceOverwrite: true to overwrite existing values (admin explicit sync).
 * System fields (circleId, syncedAt) are always updated.
 */
export async function syncCoachFromCircle(
    coachId: string,
    options?: SyncOptions
): Promise<SyncResult> {
    const forceOverwrite = options?.forceOverwrite ?? false;

    if (!process.env.CIRCLE_API_KEY) {
        return { success: false, updated: false, fieldsUpdated: [], error: "Circle not configured" };
    }

    try {
        const coach = await db.coach.findUnique({
            where: { id: coachId },
            select: {
                id: true,
                email: true,
                bio: true,
                profileImage: true,
                company: true,
                circleId: true,
            },
        });

        if (!coach) {
            return { success: false, updated: false, fieldsUpdated: [], error: "Coach not found" };
        }

        const profile = await getCircleProfileByEmail(coach.email);
        if (!profile) {
            return { success: false, updated: false, fieldsUpdated: [], error: "No Circle profile found for this email" };
        }

        // Build update payload — only fill empty fields unless forceOverwrite
        const updateData: Record<string, unknown> = {};
        const fieldsUpdated: string[] = [];

        if (profile.avatarUrl && (forceOverwrite || !coach.profileImage)) {
            updateData.profileImage = profile.avatarUrl;
            fieldsUpdated.push("profileImage");
        }

        if (profile.bio && (forceOverwrite || !coach.bio)) {
            updateData.bio = profile.bio;
            fieldsUpdated.push("bio");
        }

        if (profile.title && (forceOverwrite || !coach.company)) {
            updateData.company = profile.title;
            fieldsUpdated.push("company");
        }

        // System fields — always update
        if (profile.memberId && profile.memberId !== coach.circleId) {
            updateData.circleId = profile.memberId;
            fieldsUpdated.push("circleId");
        }

        updateData.syncedAt = new Date();

        await db.coach.update({
            where: { id: coachId },
            data: updateData,
        });

        return { success: true, updated: fieldsUpdated.length > 0, fieldsUpdated };
    } catch (error) {
        console.error("[Circle Sync] Failed to sync coach:", error);
        return {
            success: false,
            updated: false,
            fieldsUpdated: [],
            error: error instanceof Error ? error.message : "Unknown error during sync",
        };
    }
}
