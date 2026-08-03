import { db } from "@/lib/db";
import { safeImageSrc } from "@/lib/assessments/safe-image-src";
import { getCircleProfileByEmail } from "@/services/circle";

export interface SyncOptions {
    forceOverwrite?: boolean;
}

export interface SyncWarning {
    code: "invalid-image-url";
    field: "profileImage";
    message: string;
}

export interface SyncResult {
    success: boolean;
    updated: boolean;
    fieldsUpdated: string[];
    warnings: SyncWarning[];
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
        return { success: false, updated: false, fieldsUpdated: [], warnings: [], error: "Circle not configured" };
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
            return { success: false, updated: false, fieldsUpdated: [], warnings: [], error: "Coach not found" };
        }

        const profile = await getCircleProfileByEmail(coach.email);
        if (!profile) {
            return { success: false, updated: false, fieldsUpdated: [], warnings: [], error: "No Circle profile found for this email" };
        }

        // Build update payload — only fill empty fields unless forceOverwrite
        const updateData: Record<string, unknown> = {};
        const fieldsUpdated: string[] = [];
        const warnings: SyncWarning[] = [];
        const syncMode = forceOverwrite ? "force-overwrite" : "fill-empty";

        if (profile.avatarUrl && (forceOverwrite || !coach.profileImage)) {
            const safeAvatarUrl = safeImageSrc(profile.avatarUrl);
            if (safeAvatarUrl) {
                updateData.profileImage = safeAvatarUrl;
                fieldsUpdated.push("profileImage");
            } else {
                warnings.push({
                    code: "invalid-image-url",
                    field: "profileImage",
                    message: "Profile image skipped because Circle supplied an invalid URL.",
                });
            }
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

        for (const warning of warnings) {
            console.warn("[Circle Sync] Field skipped", {
                coachId,
                syncMode,
                field: warning.field,
                reason: warning.code,
            });
        }

        return { success: true, updated: fieldsUpdated.length > 0, fieldsUpdated, warnings };
    } catch (error) {
        console.error("[Circle Sync] Failed to sync coach:", error);
        return {
            success: false,
            updated: false,
            fieldsUpdated: [],
            warnings: [],
            error: error instanceof Error ? error.message : "Unknown error during sync",
        };
    }
}
